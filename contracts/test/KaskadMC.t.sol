// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Base} from "./Base.t.sol";
import {Kaskad} from "../src/Kaskad.sol";
import {KaskadMC} from "../src/KaskadMC.sol";

contract KaskadMCTest is Base {
    KaskadMC internal mc;

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        kaskad.setAsset(SYRUP, 1e18, 20_000_000e18);
        _loadSynthetic(SYRUP, 40, 31);
        mc = new KaskadMC(owner, kaskad);
    }

    function _mc(uint256 k, uint256 seed) internal view returns (KaskadMC.MCResult memory) {
        return mc.previewMC(_sc(SYRUP, 500, 10, 3, 40), k, seed);
    }

    function test_validation() public {
        vm.expectRevert(KaskadMC.InvalidPaths.selector);
        _mc(0, 1);
        vm.expectRevert(KaskadMC.InvalidPaths.selector);
        _mc(2_001, 1);
        vm.expectRevert(abi.encodeWithSelector(Kaskad.InvalidPositions.selector, 41, 40));
        mc.previewMC(_sc(SYRUP, 500, 10, 3, 41), 5, 1);
    }

    function test_readsSourceBook() public view {
        KaskadMC.MCResult memory r = _mc(3, 7);
        assertEq(r.positionsUsed, 40);
        assertEq(r.totalDebt, kaskad.preview(_sc(SYRUP, 500, 10, 3, 40)).totalDebt);
    }

    function test_deterministicAndSeedSensitive() public view {
        KaskadMC.MCResult memory a = _mc(20, 42);
        KaskadMC.MCResult memory b = _mc(20, 42);
        KaskadMC.MCResult memory c = _mc(20, 43);
        assertEq(keccak256(abi.encode(a.badDebt)), keccak256(abi.encode(b.badDebt)));
        assertTrue(keccak256(abi.encode(a.shockBps)) != keccak256(abi.encode(c.shockBps)));
    }

    function test_statisticsAreConsistent() public view {
        KaskadMC.MCResult memory r = _mc(60, 9);
        uint256 worst;
        uint256 sum;
        uint256 losses;
        for (uint256 i; i < r.paths; ++i) {
            if (r.badDebt[i] > worst) worst = r.badDebt[i];
            sum += r.badDebt[i];
            if (r.badDebt[i] > 0) ++losses;
            assertLe(r.shockBps[i], 1_500); // 3 x 5%
        }
        assertEq(r.worstBadDebt, worst);
        assertEq(r.meanBadDebt, sum / r.paths);
        assertEq(r.lossPaths, losses);
        assertLe(r.p95BadDebt, r.worstBadDebt);
        // nearest rank: at least 95% of paths are <= p95
        uint256 below;
        for (uint256 i; i < r.paths; ++i) {
            if (r.badDebt[i] <= r.p95BadDebt) ++below;
        }
        assertGe(below * 100, 95 * r.paths);
    }

    function test_meanShockIsTheScenarioShock() public view {
        // small shock: paths are cheap (few liquidations), the shock distribution is what matters
        KaskadMC.MCResult memory r = mc.previewMC(_sc(SYRUP, 50, 10, 3, 40), 150, 5);
        assertApproxEqRel(r.meanShockBps, 50, 0.15e18);
    }

    /// Memory must not grow with the number of paths beyond the per-path result words
    /// (badDebt, shockBps and the sorted copy for the percentile): 3 words per path.
    function test_memoryDoesNotGrowWithPaths() public view {
        KaskadMC.MCResult memory a = mc.previewMC(_sc(SYRUP, 50, 10, 3, 40), 10, 3);
        KaskadMC.MCResult memory b = mc.previewMC(_sc(SYRUP, 50, 10, 3, 40), 110, 3);
        assertLe(b.memoryBytes - a.memoryBytes, 100 * 3 * 32);
        assertGt(b.gasUsed, a.gasUsed * 5); // the work itself scales with K
    }

    function test_simulateEmits() public {
        vm.prank(alice);
        (bytes32 simId, KaskadMC.MCResult memory r) = mc.simulateMC(_sc(SYRUP, 500, 10, 3, 40), 8, 1);
        assertEq(simId, keccak256(abi.encode(alice, uint256(0), "mc")));
        assertEq(r.paths, 8);
        assertEq(mc.nonces(alice), 1);
    }
}
