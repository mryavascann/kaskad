// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {RiskOracle} from "./RiskOracle.sol";
import {GuardV2} from "./GuardV2.sol";
import {RiskVault} from "./RiskVault.sol";

/// @notice Chainlink CRE consumer interface: the KeystoneForwarder delivers verified reports here.
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title KaskadCREReceiver: the on-chain end of the Kaskad CRE workflow
/// @notice The workflow (cre/kaskad-risk) reads the books, RiskOracle and the markets for free, previews
/// the trigger shock off chain and decides whether anything changed. Only then does it send one report,
/// which this contract turns into the pipeline: RiskOracle.publish() for the assets that need it, then
/// GuardV2.refresh() and RiskVault.rebalance(). Every step is permissionless, so a failing step (a
/// cooldown, a stale report) is recorded and skipped instead of reverting the whole report.
/// Only the configured forwarder may call onReport: the MockKeystoneForwarder while simulating
/// (`cre workflow simulate --broadcast`), the KeystoneForwarder once deployed. Optionally pinned to
/// one workflow owner.
contract KaskadCREReceiver is IReceiver, Ownable2Step {
    /// @notice What the workflow asks for. `reason` is the workflow's code for why (see cre/kaskad-risk).
    struct Instruction {
        uint16[] publish;
        bool refreshGuard;
        bool rebalanceVault;
        uint8 reason;
    }

    RiskOracle public immutable oracle;
    GuardV2 public immutable guard;
    RiskVault public immutable vault;
    address public forwarder;
    /// @notice 0: any workflow owner.
    address public expectedOwner;
    uint256 public reports;

    event ForwarderSet(address indexed forwarder);
    event ExpectedOwnerSet(address indexed owner);
    event ReportReceived(bytes32 indexed workflowId, address indexed workflowOwner, uint8 reason, uint256 publishes);
    event Published(uint16 indexed assetId, bool atRisk, uint16 recommendedLtvBps);
    event StepFailed(bytes32 indexed step, uint16 assetId, bytes data);
    event GuardRefreshed(uint256 tripped, uint256 recovered);
    event VaultRebalanced(uint256 totalAssets);

    error InvalidForwarder();
    error NotForwarder(address sender);
    error WrongWorkflowOwner(address owner);

    constructor(address owner_, address forwarder_, RiskOracle oracle_, GuardV2 guard_, RiskVault vault_)
        Ownable(owner_)
    {
        if (forwarder_ == address(0)) revert InvalidForwarder();
        forwarder = forwarder_;
        oracle = oracle_;
        guard = guard_;
        vault = vault_;
        emit ForwarderSet(forwarder_);
    }

    /// @notice Switch from the simulation forwarder to the production one (or back).
    function setForwarder(address forwarder_) external onlyOwner {
        if (forwarder_ == address(0)) revert InvalidForwarder();
        forwarder = forwarder_;
        emit ForwarderSet(forwarder_);
    }

    function setExpectedOwner(address owner_) external onlyOwner {
        expectedOwner = owner_;
        emit ExpectedOwnerSet(owner_);
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    /// @param metadata workflowId (32) | workflowName (10) | workflowOwner (20) | reportId (2)
    /// @param report abi.encode(Instruction)
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert NotForwarder(msg.sender);
        (bytes32 workflowId, address workflowOwner) = _meta(metadata);
        if (expectedOwner != address(0) && workflowOwner != expectedOwner) revert WrongWorkflowOwner(workflowOwner);

        Instruction memory ins = abi.decode(report, (Instruction));
        ++reports;
        emit ReportReceived(workflowId, workflowOwner, ins.reason, ins.publish.length);

        for (uint256 i; i < ins.publish.length; ++i) {
            uint16 id = ins.publish[i];
            try oracle.publish(id) returns (bool atRisk, uint16 ltv) {
                emit Published(id, atRisk, ltv);
            } catch (bytes memory data) {
                emit StepFailed("publish", id, data);
            }
        }
        if (ins.refreshGuard) {
            try guard.refresh() returns (uint256 tripped, uint256 recovered) {
                emit GuardRefreshed(tripped, recovered);
            } catch (bytes memory data) {
                emit StepFailed("guard", 0, data);
            }
        }
        if (ins.rebalanceVault) {
            try vault.rebalance() {
                emit VaultRebalanced(vault.totalAssets());
            } catch (bytes memory data) {
                emit StepFailed("vault", 0, data);
            }
        }
    }

    /// @dev Shorter metadata (a bare test call) reads as zero.
    function _meta(bytes calldata m) internal pure returns (bytes32 workflowId, address workflowOwner) {
        if (m.length >= 32) workflowId = bytes32(m[0:32]);
        if (m.length >= 62) workflowOwner = address(bytes20(m[42:62]));
    }
}
