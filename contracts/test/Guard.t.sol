// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base} from "./Base.t.sol";
import {Kaskad} from "../src/Kaskad.sol";
import {Guard} from "../src/Guard.sol";
import {MockMarket} from "../src/MockMarket.sol";

contract GuardTest is Base {
    MockMarket internal marketA;
    MockMarket internal marketB;
    Guard internal guard;

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        kaskad.setAsset(SYRUP, 1e18, 20_000_000e18);
        _loadSynthetic(SYRUP, 200, 21);

        vm.startPrank(owner);
        marketA = new MockMarket(owner, "Piyasa A", 9000);
        marketB = new MockMarket(owner, "Piyasa B", 9000);
        guard = new Guard(owner, kaskad, marketB);
        marketB.setGuard(address(guard));
        vm.stopPrank();
    }

    function _config(uint16 shock, uint16 badBps, uint16 liqBps) internal {
        vm.prank(owner);
        guard.setConfig(_sc(SYRUP, shock, 10, 10, 200), badBps, liqBps, 7000);
    }

    function test_belowThresholdDoesNotTrip() public {
        _config(0, 100, 0);
        vm.prank(alice);
        assertFalse(guard.refresh());
        assertFalse(marketB.borrowPaused());
        assertEq(marketB.maxLtvBps(), 9000);
        vm.prank(alice);
        marketB.borrow(1);
    }

    function test_aboveThresholdPausesMarketB() public {
        _config(3000, 1, 0);
        vm.expectEmit(false, false, false, false, address(guard));
        emit Guard.GuardTripped(bytes32(0), 0);
        vm.prank(alice); // permissionless keeper
        assertTrue(guard.refresh());
        assertTrue(marketB.borrowPaused());
        assertEq(marketB.maxLtvBps(), 7000);

        vm.prank(alice);
        vm.expectRevert(MockMarket.BorrowIsPaused.selector);
        marketB.borrow(1);

        // unprotected market keeps lending
        assertFalse(marketA.borrowPaused());
        vm.prank(alice);
        marketA.borrow(1);
        assertEq(marketA.totalBorrowed(), 1);
    }

    function test_liquidationThresholdTrips() public {
        _config(500, 10_000, 1);
        assertTrue(guard.refresh());
        assertTrue(marketB.borrowPaused());
    }

    function test_guardSimulatesUnderItsOwnSlot() public {
        _config(500, 10_000, 0);
        guard.refresh();
        (bytes32 simId,,,,,,,,,) = kaskad.lastResult(address(guard));
        assertEq(simId, keccak256(abi.encode(address(guard), uint256(0))));
    }

    function test_unauthorizedCannotPause() public {
        vm.startPrank(alice);
        vm.expectRevert(MockMarket.NotAuthorized.selector);
        marketB.setBorrowPaused(true);
        vm.expectRevert(MockMarket.NotAuthorized.selector);
        marketB.setMaxLtv(1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        marketB.setGuard(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        guard.setConfig(_sc(SYRUP, 300, 1, 1, 1), 1, 1, 1);
        vm.stopPrank();
    }

    function test_configValidation() public {
        vm.startPrank(owner);
        vm.expectRevert(Guard.InvalidConfig.selector);
        guard.setConfig(_sc(SYRUP, 300, 1, 1, 1), 10_001, 0, 0);
        vm.expectRevert(MockMarket.InvalidLtv.selector);
        marketB.setMaxLtv(10_001);
        vm.stopPrank();
    }

    function test_ownerCanUnpause() public {
        _config(3000, 1, 0);
        guard.refresh();
        vm.prank(owner);
        marketB.setBorrowPaused(false);
        assertFalse(marketB.borrowPaused());
    }

    function test_invalidScenarioReverts() public {
        vm.prank(owner);
        guard.setConfig(_sc(SYRUP, 300, 0, 1, 1), 1, 0, 0);
        vm.expectRevert(Kaskad.InvalidSteps.selector);
        guard.refresh();
    }
}
