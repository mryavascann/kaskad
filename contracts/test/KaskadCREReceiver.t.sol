// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {RiskSetup} from "./RiskOracle.t.sol";
import {IReceiver, KaskadCREReceiver} from "../src/KaskadCREReceiver.sol";
import {RiskOracle} from "../src/RiskOracle.sol";

contract KaskadCREReceiverTest is RiskSetup {
    KaskadCREReceiver internal receiver;
    address internal forwarder = makeAddr("forwarder");
    address internal workflowOwner = makeAddr("workflowOwner");
    bytes32 internal constant WORKFLOW_ID = keccak256("kaskad-risk");

    event Published(uint16 indexed assetId, bool atRisk, uint16 recommendedLtvBps);
    event StepFailed(bytes32 indexed step, uint16 assetId, bytes data);
    event GuardRefreshed(uint256 tripped, uint256 recovered);

    function setUp() public override {
        super.setUp();
        receiver = new KaskadCREReceiver(owner, forwarder, oracle, guard, vault);
        vm.startPrank(alice);
        usd.approve(address(vault), 1_000_000e6);
        vault.deposit(1_000_000e6, alice);
        vm.stopPrank();
    }

    function _metadata(address wfOwner) internal pure returns (bytes memory) {
        return abi.encodePacked(WORKFLOW_ID, bytes10("kaskadrisk"), wfOwner, bytes2(0x0001));
    }

    function _report(uint16[] memory ids, bool guard_, bool vault_) internal pure returns (bytes memory) {
        return abi.encode(
            KaskadCREReceiver.Instruction({publish: ids, refreshGuard: guard_, rebalanceVault: vault_, reason: 1})
        );
    }

    function _both() internal pure returns (uint16[] memory ids) {
        ids = new uint16[](2);
        (ids[0], ids[1]) = (SYRUP, PT);
    }

    function test_advertisesIReceiver() public view {
        assertTrue(receiver.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(receiver.supportsInterface(type(IERC165).interfaceId));
        assertFalse(receiver.supportsInterface(0xffffffff));
    }

    function test_onlyTheForwarder() public {
        vm.expectRevert(abi.encodeWithSelector(KaskadCREReceiver.NotForwarder.selector, alice));
        vm.prank(alice);
        receiver.onReport(_metadata(workflowOwner), _report(_both(), true, true));
    }

    function test_oneReportRunsThePipeline() public {
        vm.expectEmit(address(receiver));
        emit Published(SYRUP, true, 8_500);
        vm.expectEmit(address(receiver));
        emit Published(PT, false, 9_000);
        vm.expectEmit(address(receiver));
        emit GuardRefreshed(1, 0);
        vm.prank(forwarder);
        receiver.onReport(_metadata(workflowOwner), _report(_both(), true, true));

        assertEq(receiver.reports(), 1);
        (bool atRisk,,,,) = oracle.state(SYRUP);
        assertTrue(atRisk);
        assertTrue(risky.borrowPaused());
        assertEq(risky.deposits(address(vault)), 0);
        assertEq(safe.deposits(address(vault)), 1_000_000e6);
    }

    function test_aFailingStepIsRecordedNotFatal() public {
        oracle.publish(SYRUP); // the cooldown now blocks the workflow's publish of SYRUP
        vm.expectEmit(address(receiver));
        emit StepFailed("publish", SYRUP, abi.encodeWithSelector(RiskOracle.TooSoon.selector, uint64(now_ + 1 hours)));
        vm.expectEmit(address(receiver));
        emit Published(PT, false, 9_000);
        vm.prank(forwarder);
        receiver.onReport(_metadata(workflowOwner), _report(_both(), true, false));
        assertTrue(risky.borrowPaused(), "the guard step still ran");
    }

    function test_pinnedWorkflowOwner() public {
        vm.prank(owner);
        receiver.setExpectedOwner(workflowOwner);
        vm.expectRevert(abi.encodeWithSelector(KaskadCREReceiver.WrongWorkflowOwner.selector, alice));
        vm.prank(forwarder);
        receiver.onReport(_metadata(alice), _report(_both(), false, false));
        vm.prank(forwarder);
        receiver.onReport(_metadata(workflowOwner), _report(_both(), false, false));
        assertEq(receiver.reports(), 1);
    }

    function test_forwarderSwitch() public {
        address prod = makeAddr("keystone");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice));
        receiver.setForwarder(prod);
        vm.prank(owner);
        receiver.setForwarder(prod);
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(KaskadCREReceiver.NotForwarder.selector, forwarder));
        receiver.onReport(_metadata(workflowOwner), _report(_both(), false, false));
    }
}
