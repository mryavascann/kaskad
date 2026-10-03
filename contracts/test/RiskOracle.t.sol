// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Base} from "./Base.t.sol";
import {Kaskad} from "../src/Kaskad.sol";
import {KaskadMC} from "../src/KaskadMC.sol";
import {KaskadMCv3} from "../src/KaskadMCv3.sol";
import {RiskOracle} from "../src/RiskOracle.sol";
import {GuardV2} from "../src/GuardV2.sol";
import {MockMarketV2} from "../src/MockMarketV2.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {RiskVault} from "../src/RiskVault.sol";

/// @dev The A6 system on a synthetic book: shared by the RiskOracle and CRE receiver tests.
abstract contract RiskSetup is Base {
    KaskadMC internal mc;
    KaskadMCv3 internal v3;
    RiskOracle internal oracle;
    GuardV2 internal guard;
    MockUSD internal usd;
    MockMarketV2 internal risky; // loans backed by SYRUP: thin pool
    MockMarketV2 internal safe; // loans backed by PT: deep pool
    RiskVault internal vault;

    uint16 internal constant STEP = 500;

    function setUp() public virtual override {
        super.setUp();
        vm.startPrank(owner);
        kaskad.setAsset(SYRUP, 1e18, 2_000_000e18); // thin exit pool: cascades get stuck
        vm.stopPrank();
        _loadSynthetic(SYRUP, 40, 31);
        _loadSynthetic(PT, 40, 32); // Base: effectively infinite depth

        mc = new KaskadMC(owner, kaskad);
        v3 = new KaskadMCv3(owner, kaskad);
        oracle = new RiskOracle(owner, v3);
        vm.startPrank(owner);
        oracle.setRule(SYRUP, _rule(1_000, 10, 1_000));
        oracle.setRule(PT, _rule(1_000, 10, 1_000));
        guard = new GuardV2(owner, oracle, 2 hours, 1 hours);
        usd = new MockUSD(owner);
        risky = new MockMarketV2(owner, usd, SYRUP, "syrupUSDC market", 9_000);
        safe = new MockMarketV2(owner, usd, PT, "PT market", 9_000);
        risky.setGuard(address(guard));
        safe.setGuard(address(guard));
        guard.addMarket(risky);
        guard.addMarket(safe);
        vault = new RiskVault(owner, usd, oracle, 2 hours);
        vault.addMarket(risky);
        vault.addMarket(safe);
        usd.mint(alice, 1_000_000e6);
        vm.stopPrank();
        _at(T0);
    }

    uint256 internal constant T0 = 1_800_000_000;
    uint256 internal now_;

    /// @dev via-IR caches block.timestamp across warps, so tests keep their own clock.
    function _at(uint256 t) internal {
        now_ = t;
        vm.warp(t);
    }

    function _wait(uint256 dt) internal {
        _at(now_ + dt);
    }

    function _rule(uint16 trigger, uint16 lossBps, uint16 stuckBps) internal pure returns (RiskOracle.Rule memory) {
        return RiskOracle.Rule({
            enabled: true,
            steps: 10,
            rounds: 3,
            maxPositions: 0,
            oracleFeedbackBps: 0,
            triggerShockBps: trigger,
            lossThresholdBps: lossBps,
            stuckThresholdBps: stuckBps,
            ltvFloorBps: 7_000,
            ltvCeilingBps: 9_000,
            ltvStepBps: STEP,
            minInterval: 1 hours
        });
    }
}

contract RiskOracleTest is RiskSetup {
    // ------------------------------------------------------------------ KaskadMCv3

    function test_v3_sameCascadeAsKaskadMC() public view {
        Kaskad.Scenario memory s = _scf(SYRUP, 1_000, 10, 3, 40, 0);
        (Kaskad.Result memory r,) = v3.previewWithHidden(s);
        Kaskad.Result memory m = mc.preview(s);
        assertEq(r.totalDebt, m.totalDebt);
        assertEq(r.badDebt, m.badDebt);
        assertEq(r.stuckDebt, m.stuckDebt);
        assertEq(r.totalLiquidated, m.totalLiquidated);
        assertEq(r.finalPrice, m.finalPrice);
        assertEq(r.liquidations, m.liquidations);
        assertEq(r.rounds, m.rounds);
    }

    function testFuzz_v3_hiddenIsZeroWhenTheOracleFollowsThePool(uint16 shock) public view {
        shock = uint16(bound(shock, 1, 5_000));
        (Kaskad.Result memory r, KaskadMCv3.Hidden memory h) =
            v3.previewWithHidden(_scf(SYRUP, shock, 10, 3, 40, 10_000));
        assertEq(h.spotPrice, h.oraclePrice);
        assertEq(h.badDebtAtSpot, r.badDebt);
        assertEq(h.hiddenBadDebt, 0);
    }

    function testFuzz_v3_spotNeverAboveOracle(uint16 shock) public view {
        shock = uint16(bound(shock, 1, 5_000));
        (Kaskad.Result memory r, KaskadMCv3.Hidden memory h) = v3.previewWithHidden(_scf(SYRUP, shock, 10, 3, 40, 0));
        assertLe(h.spotPrice, h.oraclePrice);
        assertGe(h.badDebtAtSpot, r.badDebt);
        assertEq(h.hiddenBadDebt, h.badDebtAtSpot - r.badDebt);
    }

    function test_v3_thinPoolHidesDebtFromAnExternalOracle() public view {
        (Kaskad.Result memory r, KaskadMCv3.Hidden memory h) = v3.previewWithHidden(_scf(SYRUP, 1_000, 10, 3, 40, 0));
        assertGt(r.stuckDebt, 0, "the thin pool leaves debt stuck");
        assertLt(h.spotPrice, h.oraclePrice, "the pool ends under the oracle");
        assertGt(h.hiddenBadDebt, 0, "some of it is underwater at the pool's price");
    }

    // ------------------------------------------------------------------ RiskOracle

    function test_oracle_ruleValidation() public {
        vm.startPrank(owner);
        vm.expectRevert(RiskOracle.InvalidRule.selector);
        oracle.setRule(SYRUP, _rule(250, 10, 1_000)); // trigger is not a standard shock
        RiskOracle.Rule memory r = _rule(300, 10, 1_000);
        r.ltvStepBps = 501;
        vm.expectRevert(RiskOracle.InvalidRule.selector);
        oracle.setRule(SYRUP, r);
        r = _rule(300, 10, 1_000);
        r.ltvFloorBps = 9_500;
        vm.expectRevert(RiskOracle.InvalidRule.selector);
        oracle.setRule(SYRUP, r);
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice));
        oracle.setRule(SYRUP, _rule(300, 10, 1_000));
        vm.expectRevert(abi.encodeWithSelector(RiskOracle.AssetNotEnabled.selector, 7));
        oracle.publish(7);
    }

    function test_oracle_publishStoresTheFourShocksFromTheEngine() public {
        vm.prank(alice); // permissionless
        oracle.publish(SYRUP);
        uint16[4] memory s = oracle.shocks();
        for (uint256 i; i < 4; ++i) {
            RiskOracle.Report memory rep = oracle.latest(SYRUP, s[i]);
            (Kaskad.Result memory r, KaskadMCv3.Hidden memory h) = v3.previewWithHidden(_scf(SYRUP, s[i], 10, 3, 40, 0));
            assertEq(rep.positions, 40, "maxPositions 0 = the whole book");
            assertEq(rep.totalDebt, r.totalDebt);
            assertEq(rep.badDebt, r.badDebt);
            assertEq(rep.stuckDebt, r.stuckDebt);
            assertEq(rep.hiddenBadDebt, h.hiddenBadDebt);
            assertEq(rep.spotPrice, h.spotPrice);
            assertEq(rep.publishedAt, now_);
        }
    }

    function test_oracle_cooldown() public {
        oracle.publish(SYRUP);
        vm.expectRevert(abi.encodeWithSelector(RiskOracle.TooSoon.selector, uint64(now_ + 1 hours)));
        oracle.publish(SYRUP);
        _wait(1 hours);
        oracle.publish(SYRUP);
    }

    function test_oracle_recommendationMovesInBoundedSteps() public {
        // At risk: one step down per publish, never under the floor.
        uint16[5] memory down = [uint16(8_500), 8_000, 7_500, 7_000, 7_000];
        for (uint256 i; i < 5; ++i) {
            (bool atRisk, uint16 ltv) = oracle.publish(SYRUP);
            assertTrue(atRisk);
            assertEq(ltv, down[i]);
            _wait(1 hours);
        }
        // Risk clears (thresholds above what the book shows): back up one step at a time, never over the ceiling.
        vm.prank(owner);
        oracle.setRule(SYRUP, _rule(1_000, 10_000, 10_000));
        uint16[5] memory up = [uint16(7_500), 8_000, 8_500, 9_000, 9_000];
        for (uint256 i; i < 5; ++i) {
            (bool atRisk, uint16 ltv) = oracle.publish(SYRUP);
            assertFalse(atRisk);
            assertEq(ltv, up[i]);
            _wait(1 hours);
        }
    }

    function test_oracle_deepPoolIsNotAtRisk() public {
        (bool atRisk, uint16 ltv) = oracle.publish(PT);
        assertFalse(atRisk);
        assertEq(ltv, 9_000);
    }

    // ------------------------------------------------------------------ GuardV2

    function test_guard_pausesTheFlaggedMarketOnly() public {
        oracle.publish(SYRUP);
        oracle.publish(PT);
        vm.prank(alice); // permissionless
        (uint256 tripped,) = guard.refresh();
        assertEq(tripped, 1);
        assertTrue(risky.borrowPaused());
        assertEq(risky.maxLtvBps(), 8_500);
        assertFalse(safe.borrowPaused());
        vm.expectRevert(MockMarketV2.BorrowIsPaused.selector);
        risky.borrow(1);
        safe.borrow(1);
    }

    function test_guard_ignoresStaleReports() public {
        oracle.publish(SYRUP);
        _wait(3 hours); // older than maxReportAge (2 h)
        (uint256 tripped,) = guard.refresh();
        assertEq(tripped, 0);
        assertFalse(risky.borrowPaused());
    }

    function test_guard_reopensOnlyAfterTheRecoveryDelay() public {
        oracle.publish(SYRUP);
        guard.refresh();
        assertTrue(risky.borrowPaused());

        vm.prank(owner);
        oracle.setRule(SYRUP, _rule(1_000, 10_000, 10_000)); // risk clears
        _wait(30 minutes);
        vm.expectRevert(); // the oracle's own cooldown (1 h) still runs
        oracle.publish(SYRUP);
        _wait(30 minutes);
        oracle.publish(SYRUP);
        // Exactly 1 h since the market was last at risk: the delay has passed, it reopens.
        (, uint256 recovered) = guard.refresh();
        assertEq(recovered, 1);
        assertFalse(risky.borrowPaused());
        assertEq(risky.maxLtvBps(), 9_000);
    }

    // ------------------------------------------------------------------ RiskVault

    function _deposit(uint256 amount) internal {
        vm.startPrank(alice);
        usd.approve(address(vault), amount);
        vault.deposit(amount, alice);
        vm.stopPrank();
    }

    function test_vault_staysIdleWithoutReports_thenLeavesTheFlaggedMarket() public {
        _deposit(1_000_000e6);
        vault.rebalance(); // no report yet: every market is flagged, nothing placed
        assertEq(usd.balanceOf(address(vault)), 1_000_000e6);

        oracle.publish(SYRUP); // at risk
        oracle.publish(PT); // fine
        vm.prank(alice); // permissionless
        vault.rebalance();
        assertEq(risky.deposits(address(vault)), 0);
        assertEq(safe.deposits(address(vault)), 1_000_000e6);
        assertEq(vault.totalAssets(), 1_000_000e6, "moving funds changes no balance");
    }

    function test_vault_pullsOutWhenAMarketTurnsRisky() public {
        vm.prank(owner);
        oracle.setRule(SYRUP, _rule(1_000, 10_000, 10_000)); // both fine at first
        oracle.publish(SYRUP);
        oracle.publish(PT);
        _deposit(1_000_000e6);
        vault.rebalance();
        assertEq(risky.deposits(address(vault)), 500_000e6);
        assertEq(safe.deposits(address(vault)), 500_000e6);

        vm.prank(owner);
        oracle.setRule(SYRUP, _rule(1_000, 10, 1_000)); // the syrupUSDC market is flagged
        _wait(1 hours);
        oracle.publish(SYRUP);
        oracle.publish(PT);
        vault.rebalance();
        assertEq(risky.deposits(address(vault)), 0);
        assertEq(safe.deposits(address(vault)), 1_000_000e6);
    }

    function test_vault_withdrawPullsFromTheMarkets() public {
        oracle.publish(SYRUP);
        oracle.publish(PT);
        _deposit(1_000_000e6);
        vault.rebalance();
        vm.startPrank(alice);
        vault.redeem(vault.balanceOf(alice), alice, alice);
        vm.stopPrank();
        assertEq(usd.balanceOf(alice), 1_000_000e6);
        assertEq(vault.totalAssets(), 0);
    }
}
