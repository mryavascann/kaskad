// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base} from "./Base.t.sol";
import {Kaskad} from "../src/Kaskad.sol";
import {PositionBook, PositionLib} from "../src/PositionBook.sol";

contract PositionBookTest is Base {
    function testFuzz_packRoundTrip(uint88 c, uint88 d, uint32 o, uint8 id, uint16 lt, uint16 b, uint8 e) public pure {
        PositionLib.Position memory p = PositionLib.Position(c, d, o, id, lt, b, e);
        PositionLib.Position memory q = PositionLib.unpack(PositionLib.pack(p));
        assertEq(q.collateral, c);
        assertEq(q.debt, d);
        assertEq(q.otherColl, o);
        assertEq(q.collateralId, id);
        assertEq(q.ltBps, lt);
        assertEq(q.bonusBps, b);
        assertEq(q.eMode, e);
    }

    function test_onlyOwner() public {
        uint256[] memory a = new uint256[](1);
        a[0] = _pos(SYRUP, 1e6, 1e6, 0, 9200, 400);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        kaskad.loadPositions(SYRUP, a);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        kaskad.setAsset(SYRUP, 1e18, 1e18);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        kaskad.resetBook(SYRUP);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        kaskad.setDataInfo(1);
        vm.stopPrank();
    }

    function test_ownershipIsTwoStep() public {
        vm.prank(owner);
        kaskad.transferOwnership(alice);
        assertEq(kaskad.owner(), owner);
        vm.prank(alice);
        kaskad.acceptOwnership();
        assertEq(kaskad.owner(), alice);
    }

    function test_loadRejectsInvalidPositions() public {
        uint256[4] memory bad = [
            _pos(PT, 1e6, 1e6, 0, 9200, 400), // wrong asset
            _pos(SYRUP, 1e6, 0, 0, 9200, 400), // zero debt
            _pos(SYRUP, 1e6, 1e6, 0, 0, 400), // zero lt
            _pos(SYRUP, 1e6, 1e6, 0, 10_001, 400) // lt > 100%
        ];
        for (uint256 i; i < bad.length; ++i) {
            uint256[] memory a = new uint256[](1);
            a[0] = bad[i];
            vm.prank(owner);
            vm.expectRevert(abi.encodeWithSelector(PositionBook.InvalidPosition.selector, 0));
            kaskad.loadPositions(SYRUP, a);
        }
        uint256[] memory b = new uint256[](1);
        b[0] = _pos(SYRUP, 1e6, 1e6, 0, 9200, 5001); // bonus too large
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PositionBook.InvalidPosition.selector, 0));
        kaskad.loadPositions(SYRUP, b);
    }

    function test_assetValidation() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(PositionBook.InvalidAsset.selector, 16));
        kaskad.setAsset(16, 1e18, 1e18);
        vm.expectRevert(PositionBook.InvalidConfig.selector);
        kaskad.setAsset(SYRUP, 0, 1e18);
        vm.expectRevert(PositionBook.InvalidConfig.selector);
        kaskad.setAsset(SYRUP, 1e18, 0);
        vm.stopPrank();
    }

    function test_calibratedBookIsSeparate() public {
        uint16 cal = uint16(kaskad.CALIBRATED()) | SYRUP;
        _loadSynthetic(SYRUP, 10, 1);
        _loadSynthetic(cal, 40, 2);
        assertEq(kaskad.bookLength(SYRUP), 10);
        assertEq(kaskad.bookLength(cal), 40);
        // calibrated positions still carry the real collateral id and use its price
        assertEq(kaskad.positionAt(cal, 0).collateralId, SYRUP);
        assertEq(kaskad.preview(_sc(cal, 300, 1, 1, 40)).startPrice, 1e18);
        // a calibrated book id cannot take another asset's positions
        uint256[] memory a = new uint256[](1);
        a[0] = _pos(PT, 1e6, 1e6, 0, 9200, 400);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PositionBook.InvalidPosition.selector, 0));
        kaskad.loadPositions(cal, a);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PositionBook.InvalidAsset.selector, 512));
        kaskad.loadPositions(512, a);
    }

    function test_loadStatsAndResetReusesSlots() public {
        _loadSynthetic(SYRUP, 300, 1);
        (uint128 coll, uint128 debt,, uint32 count) = kaskad.bookStats(SYRUP);
        assertEq(count, 300);
        assertGt(coll, debt);
        uint256 first = kaskad.rawSlot(SYRUP, 0);

        vm.prank(owner);
        kaskad.resetBook(SYRUP);
        assertEq(kaskad.bookLength(SYRUP), 0);
        vm.expectRevert(abi.encodeWithSelector(PositionBook.InvalidPosition.selector, 0));
        kaskad.rawSlot(SYRUP, 0);

        _loadSynthetic(SYRUP, 10, 2);
        assertEq(kaskad.bookLength(SYRUP), 10);
        assertTrue(kaskad.rawSlot(SYRUP, 0) != first);
        PositionLib.Position memory p = kaskad.positionAt(SYRUP, 0);
        assertEq(p.collateralId, SYRUP);
    }
}

contract KaskadEngineTest is Base {
    // --------------------------------------------------------------- validation

    function test_scenarioValidation() public {
        _loadSynthetic(SYRUP, 10, 1);
        vm.expectRevert(Kaskad.InvalidShock.selector);
        kaskad.preview(_sc(SYRUP, 10_001, 1, 1, 10));
        vm.expectRevert(Kaskad.InvalidFeedback.selector);
        kaskad.preview(_scf(SYRUP, 300, 1, 1, 10, 10_001));
        vm.expectRevert(Kaskad.InvalidSteps.selector);
        kaskad.preview(_sc(SYRUP, 300, 0, 1, 10));
        vm.expectRevert(Kaskad.InvalidSteps.selector);
        kaskad.preview(_sc(SYRUP, 300, 101, 1, 10));
        vm.expectRevert(Kaskad.InvalidRounds.selector);
        kaskad.preview(_sc(SYRUP, 300, 1, 0, 10));
        vm.expectRevert(Kaskad.InvalidRounds.selector);
        kaskad.preview(_sc(SYRUP, 300, 1, 21, 10));
        vm.expectRevert(abi.encodeWithSelector(Kaskad.InvalidPositions.selector, 0, 10));
        kaskad.preview(_sc(SYRUP, 300, 1, 1, 0));
        vm.expectRevert(abi.encodeWithSelector(Kaskad.InvalidPositions.selector, 11, 10));
        kaskad.preview(_sc(SYRUP, 300, 1, 1, 11));
        vm.expectRevert(abi.encodeWithSelector(PositionBook.InvalidAsset.selector, 3));
        kaskad.preview(_sc(3, 300, 1, 1, 1)); // asset without config
        vm.expectRevert(abi.encodeWithSelector(PositionBook.InvalidAsset.selector, 99));
        kaskad.preview(_sc(99, 300, 1, 1, 1));
        vm.expectRevert(abi.encodeWithSelector(PositionBook.InvalidAsset.selector, 512 + 9));
        kaskad.preview(_sc(512 + 9, 300, 1, 1, 1));
    }

    // --------------------------------------------------------------- hand-computed cases

    // 1M tokens at $1, $900k debt, LT 92%, bonus 4%. -3%: HF 0.9916 -> 50% close factor.
    function test_halfCloseFactor() public {
        _load(SYRUP, _pos(SYRUP, 1_000_000e6, 900_000e6, 0, 9200, 400));
        Kaskad.Result memory r = kaskad.preview(_sc(SYRUP, 300, 1, 5, 1));
        assertEq(r.totalLiquidated, 450_000e18);
        assertApproxEqRel(r.totalSeized, 482_474.226804123711340206e18, 1e9);
        assertEq(r.liquidations, 1);
        assertEq(r.rounds, 1);
        assertEq(r.badDebt, 0);
        assertEq(r.totalDebt, 900_000e18);
        assertEq(r.log.length, 1);
        assertEq(r.log[0].priceWad, 0.97e18);
    }

    /// -50%: HF 0.51 -> full close, collateral runs out -> bad debt.
    function test_fullCloseAndBadDebt() public {
        _load(SYRUP, _pos(SYRUP, 1_000_000e6, 900_000e6, 0, 9200, 400));
        Kaskad.Result memory r = kaskad.preview(_sc(SYRUP, 5000, 1, 5, 1));
        assertEq(r.totalSeized, 1_000_000e18);
        assertApproxEqAbs(r.totalLiquidated, uint256(500_000e18) * 10_000 / 10_400, 1e6);
        assertApproxEqAbs(r.badDebt, 900_000e18 - uint256(500_000e18) * 10_000 / 10_400, 1e6);
        assertEq(r.log[0].deficit, r.badDebt);
    }

    /// Debt below $2,000 is closed in full even when HF > 0.95.
    function test_smallPositionFullClose() public {
        _load(SYRUP, _pos(SYRUP, 1_500e6, 1_350e6, 0, 9200, 400));
        Kaskad.Result memory r = kaskad.preview(_sc(SYRUP, 300, 1, 5, 1));
        assertEq(r.totalLiquidated, 1_350e18);
        assertEq(r.badDebt, 0);
    }

    function test_noShockNoLiquidations() public {
        _loadSynthetic(SYRUP, 200, 7);
        Kaskad.Result memory r = kaskad.preview(_sc(SYRUP, 0, 10, 5, 200));
        assertEq(r.totalLiquidated, 0);
        assertEq(r.rounds, 0);
        assertEq(r.badDebt, 0);
        assertEq(r.finalPrice, 1e18);
    }

    /// Other collateral (fixed price) lowers the liquidation price: lp = (1.2M/0.92 - 400k)/1M = 0.9043.
    function test_otherCollateralCounts() public {
        _load(SYRUP, _pos(SYRUP, 1_000_000e6, 1_200_000e6, 400_000, 9200, 400));
        assertEq(kaskad.preview(_sc(SYRUP, 900, 1, 5, 1)).totalLiquidated, 0); // 0.91 > lp
        assertGt(kaskad.preview(_sc(SYRUP, 1000, 1, 5, 1)).totalLiquidated, 0); // 0.90 < lp
    }

    /// Seized collateral sold into a shallow pool pushes the price under the second position's
    /// liquidation price: the cascade.
    function test_cascadeThroughPriceImpact() public {
        uint256[] memory a = new uint256[](2);
        a[0] = _pos(SYRUP, 1_000_000e6, 901_600e6, 0, 9200, 400); // lp 0.98
        a[1] = _pos(SYRUP, 1_000_000e6, 887_800e6, 0, 9200, 400); // lp 0.965
        vm.prank(owner);
        kaskad.loadPositions(SYRUP, a);

        Kaskad.Result memory deep = kaskad.preview(_sc(SYRUP, 300, 1, 10, 2));
        assertEq(deep.liquidations, 1);

        vm.prank(owner);
        kaskad.setAsset(SYRUP, 1e18, 10_000_000e18); // $10M pool
        Kaskad.Result memory shallow = kaskad.preview(_sc(SYRUP, 300, 1, 10, 2));
        assertGe(shallow.liquidations, 2);
        assertGe(shallow.rounds, 2);
        assertLt(shallow.finalPrice, deep.finalPrice);
        assertGt(shallow.totalLiquidated, deep.totalLiquidated);
        for (uint256 i = 1; i < shallow.log.length; ++i) {
            assertLe(shallow.log[i].priceWad, shallow.log[i - 1].priceWad);
        }
    }

    function test_partialResolutionScalesDepth() public {
        uint256 risky = _pos(SYRUP, 1_000_000e6, 901_600e6, 0, 9200, 400); // lp 0.98
        uint256[] memory a = new uint256[](2);
        a[0] = risky;
        a[1] = _pos(SYRUP, 3_000_000e6, 901_600e6, 0, 9200, 400); // same debt, never liquidated here
        vm.startPrank(owner);
        kaskad.loadPositions(SYRUP, a);
        kaskad.setAsset(SYRUP, 1e18, 80_000_000e18);
        vm.stopPrank();
        // first position only = half of the book's debt -> engine uses half the depth ($40M)
        Kaskad.Result memory partialRun = kaskad.preview(_sc(SYRUP, 300, 1, 3, 1));

        vm.startPrank(owner);
        kaskad.resetBook(SYRUP);
        uint256[] memory b = new uint256[](1);
        b[0] = risky;
        kaskad.loadPositions(SYRUP, b);
        kaskad.setAsset(SYRUP, 1e18, 40_000_000e18);
        vm.stopPrank();
        Kaskad.Result memory alone = kaskad.preview(_sc(SYRUP, 300, 1, 3, 1));

        assertGt(alone.totalLiquidated, 0);
        assertEq(partialRun.finalPrice, alone.finalPrice);
        assertEq(partialRun.totalLiquidated, alone.totalLiquidated);
    }

    /// A thin pool caps each liquidation at break-even for the liquidator. The wave moves the pool
    /// to x0 * (1 + bonus), i.e. price * 1/(1+bonus)^2, whatever the depth.
    function test_profitabilityCapLeavesStuckDebt() public {
        _load(SYRUP, _pos(SYRUP, 10_000_000e6, 9_000_000e6, 0, 9200, 244)); // lp 0.978
        vm.prank(owner);
        kaskad.setAsset(SYRUP, 1e18, 1_000_000e18); // $1M pool: x0 = 500k tokens
        Kaskad.Result memory r = kaskad.preview(_sc(SYRUP, 300, 1, 1, 1));
        assertApproxEqRel(r.totalSeized, 12_200e18, 1e12); // x0 * 2.44%
        assertApproxEqRel(r.totalLiquidated, uint256(12_200e18) * 9700 / 10_244, 1e12);
        assertEq(r.liquidations, 1);
        assertApproxEqRel(r.finalPrice, uint256(0.97e18) * 1e8 / (10_244 * 10_244), 1e12);
        // still above water but under HF 1 -> stuck, not bad debt
        assertEq(r.badDebt, 0);
        assertApproxEqRel(r.stuckDebt, 9_000_000e18 - r.totalLiquidated, 1e12);
    }

    /// Exchange-rate oracle (feedback 0): selling into the pool does not move the oracle, so the
    /// cascade cannot feed itself; liquidations stall and debt gets stuck instead.
    function test_oracleFeedbackDrivesTheCascade() public {
        vm.prank(owner);
        kaskad.setAsset(SYRUP, 1e18, 5_000_000e18);
        _loadSynthetic(SYRUP, 300, 5);
        Kaskad.Result memory market = kaskad.preview(_scf(SYRUP, 300, 20, 3, 300, 10_000));
        Kaskad.Result memory rate = kaskad.preview(_scf(SYRUP, 300, 20, 3, 300, 0));
        assertEq(rate.finalPrice, 0.97e18);
        assertLt(market.finalPrice, rate.finalPrice);
        assertGt(market.badDebt, rate.badDebt);
        assertEq(rate.badDebt, 0);
        assertGt(rate.stuckDebt, 0);
        for (uint256 i; i < rate.log.length; ++i) {
            assertGe(rate.log[i].priceWad, 0.97e18);
        }
    }

    function test_totalWipeoutTerminates() public {
        _loadSynthetic(SYRUP, 100, 3);
        Kaskad.Result memory r = kaskad.preview(_sc(SYRUP, 10_000, 5, 20, 100));
        assertEq(r.finalPrice, 0);
        assertLe(r.totalLiquidated, r.totalDebt);
        assertGt(r.badDebt, 0);
    }

    function test_resolutionUsesPrefix() public {
        _loadSynthetic(SYRUP, 500, 9);
        Kaskad.Result memory small = kaskad.preview(_sc(SYRUP, 300, 5, 5, 100));
        Kaskad.Result memory big = kaskad.preview(_sc(SYRUP, 300, 5, 5, 500));
        assertEq(small.positionsUsed, 100);
        assertEq(big.positionsUsed, 500);
        assertGt(big.totalDebt, small.totalDebt);
        assertGt(big.memoryBytes, small.memoryBytes);
        assertGt(big.gasUsed, small.gasUsed);
    }

    // --------------------------------------------------------------- simulate

    function test_simulateStoresPerSenderAndEmits() public {
        _loadSynthetic(SYRUP, 200, 5);
        Kaskad.Scenario memory s = _sc(SYRUP, 800, 5, 5, 200);
        bytes32 expectedId = keccak256(abi.encode(alice, uint256(0)));

        vm.expectEmit(true, true, false, false);
        emit Kaskad.SimulationDone(expectedId, alice, 0, 0, 0, 0, 0, 0, 0, 0);
        vm.prank(alice);
        (bytes32 simId, Kaskad.Result memory r) = kaskad.simulate(s);

        assertEq(simId, expectedId);
        assertEq(kaskad.nonces(alice), 1);
        (bytes32 storedId,, uint128 liq, uint128 bad,,,,,,) = kaskad.lastResult(alice);
        assertEq(storedId, simId);
        assertEq(liq, r.totalLiquidated);
        assertEq(bad, r.badDebt);
        (bytes32 otherId,,,,,,,,,) = kaskad.lastResult(address(this));
        assertEq(otherId, bytes32(0));

        Kaskad.Result memory p = kaskad.preview(s);
        assertEq(p.totalLiquidated, r.totalLiquidated);
        assertEq(p.badDebt, r.badDebt);
    }

    function test_simulateDoesNotTouchBook() public {
        _loadSynthetic(SYRUP, 50, 11);
        bytes32 before = _bookHash(SYRUP, 50);
        vm.prank(alice);
        kaskad.simulate(_sc(SYRUP, 2000, 10, 10, 50));
        assertEq(_bookHash(SYRUP, 50), before);
    }

    function test_previewCurve() public {
        _loadSynthetic(SYRUP, 300, 13);
        uint16[] memory shocks = new uint16[](4);
        shocks[0] = 100;
        shocks[1] = 300;
        shocks[2] = 1000;
        shocks[3] = 3000;
        (uint256[] memory bad, uint256[] memory liq, uint256 gasUsed, uint256 mem) =
            kaskad.previewCurve(_sc(SYRUP, 0, 5, 5, 300), shocks);
        assertEq(bad.length, 4);
        for (uint256 i = 1; i < 4; ++i) {
            assertGe(liq[i], liq[i - 1]);
        }
        assertGt(gasUsed, 0);
        assertGt(mem, 0);

        vm.expectRevert(Kaskad.InvalidCurve.selector);
        kaskad.previewCurve(_sc(SYRUP, 0, 5, 5, 300), new uint16[](0));
        vm.expectRevert(Kaskad.InvalidCurve.selector);
        kaskad.previewCurve(_sc(SYRUP, 0, 5, 5, 300), new uint16[](17));
    }

    // --------------------------------------------------------------- fuzz

    function testFuzz_boundedAndSane(
        uint16 shock,
        uint16 steps,
        uint16 rounds,
        uint32 n,
        uint128 depth,
        uint256 seed,
        uint16 fb
    ) public {
        fb = uint16(bound(fb, 0, 10_000));
        shock = uint16(bound(shock, 0, 10_000));
        steps = uint16(bound(steps, 1, 30));
        rounds = uint16(bound(rounds, 1, 20));
        n = uint32(bound(n, 1, 150));
        depth = uint128(bound(depth, 1e18, 1e30));
        vm.prank(owner);
        kaskad.setAsset(SYRUP, 1e18, depth);
        _loadSynthetic(SYRUP, n, seed);

        Kaskad.Result memory r = kaskad.preview(_scf(SYRUP, shock, steps, rounds, n, fb));
        assertLe(r.totalLiquidated, r.totalDebt, "liquidated <= debt");
        assertLe(r.badDebt + r.stuckDebt, r.totalDebt, "bad + stuck <= debt");
        assertLe(r.totalSeized, r.totalCollateral, "seized <= collateral");
        assertLe(r.finalPrice, r.startPrice, "price never rises");
        assertLe(r.rounds, uint256(steps) * rounds, "rounds bounded");
        assertEq(r.log.length, r.rounds);
        uint256 prev = r.startPrice;
        for (uint256 i; i < r.log.length; ++i) {
            assertLe(r.log[i].priceWad, prev, "monotone price path");
            prev = r.log[i].priceWad;
        }
    }

    function _bookHash(uint16 assetId, uint256 n) internal view returns (bytes32 h) {
        for (uint256 i; i < n; ++i) {
            h = keccak256(abi.encode(h, kaskad.rawSlot(assetId, i)));
        }
    }
}
