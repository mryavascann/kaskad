// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {MockMarketV2} from "./MockMarketV2.sol";
import {RiskOracle} from "./RiskOracle.sol";

/// @title GuardV2: a circuit breaker that reads RiskOracle
/// @notice Anyone may call `refresh()`. For each watched market it reads RiskOracle's state for the
/// market's collateral: at risk -> pause borrowing and apply the recommended max LTV; clear again for
/// at least `recoveryDelay` -> reopen. A report older than `maxReportAge` is ignored (no action on
/// stale data). The first Guard read one fixed scenario and only ever paused one market.
contract GuardV2 is Ownable2Step {
    RiskOracle public immutable oracle;
    MockMarketV2[] internal _markets;
    uint32 public maxReportAge;
    uint32 public recoveryDelay;
    /// @notice When the market was last seen at risk (0: never).
    mapping(address market => uint64) public lastAtRisk;

    event MarketAdded(address indexed market, uint16 collateralAssetId);
    event ConfigSet(uint32 maxReportAge, uint32 recoveryDelay);
    event Tripped(address indexed market, uint16 collateralAssetId, uint16 maxLtvBps);
    event Recovered(address indexed market, uint16 collateralAssetId, uint16 maxLtvBps);
    event Skipped(address indexed market, uint16 collateralAssetId, string reason);

    constructor(address owner_, RiskOracle oracle_, uint32 maxReportAge_, uint32 recoveryDelay_) Ownable(owner_) {
        oracle = oracle_;
        maxReportAge = maxReportAge_;
        recoveryDelay = recoveryDelay_;
    }

    function markets() external view returns (MockMarketV2[] memory) {
        return _markets;
    }

    function addMarket(MockMarketV2 market) external onlyOwner {
        _markets.push(market);
        emit MarketAdded(address(market), market.collateralAssetId());
    }

    function setConfig(uint32 maxReportAge_, uint32 recoveryDelay_) external onlyOwner {
        maxReportAge = maxReportAge_;
        recoveryDelay = recoveryDelay_;
        emit ConfigSet(maxReportAge_, recoveryDelay_);
    }

    /// @notice Permissionless keeper entry point. Returns how many markets were paused and reopened.
    function refresh() external returns (uint256 tripped, uint256 recovered) {
        for (uint256 i; i < _markets.length; ++i) {
            MockMarketV2 m = _markets[i];
            uint16 assetId = m.collateralAssetId();
            (bool atRisk, uint16 ltv, uint64 published,,) = oracle.state(assetId);
            if (published == 0 || block.timestamp > uint256(published) + maxReportAge) {
                emit Skipped(address(m), assetId, "stale report");
                continue;
            }
            if (atRisk) {
                lastAtRisk[address(m)] = uint64(block.timestamp);
                if (!m.borrowPaused()) m.setBorrowPaused(true);
                if (m.maxLtvBps() != ltv) m.setMaxLtv(ltv);
                emit Tripped(address(m), assetId, ltv);
                ++tripped;
            } else if (m.borrowPaused() && block.timestamp >= uint256(lastAtRisk[address(m)]) + recoveryDelay) {
                m.setBorrowPaused(false);
                if (m.maxLtvBps() != ltv) m.setMaxLtv(ltv);
                emit Recovered(address(m), assetId, ltv);
                ++recovered;
            }
        }
    }
}
