// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Kaskad} from "./Kaskad.sol";
import {MockMarket} from "./MockMarket.sol";

/// @notice Circuit breaker: anyone may call `refresh()`; it runs the owner-set standard
/// scenario on Kaskad and, if the simulated damage crosses a threshold, pauses borrowing on
/// the protected market and lowers its max LTV.
contract Guard is Ownable2Step {
    uint256 internal constant BPS = 10_000;

    Kaskad public immutable engine;
    MockMarket public immutable market;

    Kaskad.Scenario internal _scenario;
    uint16 public badDebtThresholdBps; // bad debt / simulated debt
    uint16 public liquidationThresholdBps; // liquidated / simulated debt, 0 = disabled
    uint16 public safeLtvBps;

    event ConfigSet(
        Kaskad.Scenario scenario, uint16 badDebtThresholdBps, uint16 liquidationThresholdBps, uint16 safeLtvBps
    );
    event GuardChecked(bytes32 indexed simId, uint256 badDebtRatioBps, uint256 liquidationRatioBps, bool tripped);
    event GuardTripped(bytes32 indexed simId, uint256 badDebtRatio);

    error InvalidConfig();

    constructor(address owner_, Kaskad engine_, MockMarket market_) Ownable(owner_) {
        engine = engine_;
        market = market_;
    }

    function setConfig(
        Kaskad.Scenario calldata scenario_,
        uint16 badDebtThresholdBps_,
        uint16 liquidationThresholdBps_,
        uint16 safeLtvBps_
    ) external onlyOwner {
        if (badDebtThresholdBps_ > BPS || liquidationThresholdBps_ > BPS || safeLtvBps_ > BPS) {
            revert InvalidConfig();
        }
        _scenario = scenario_;
        badDebtThresholdBps = badDebtThresholdBps_;
        liquidationThresholdBps = liquidationThresholdBps_;
        safeLtvBps = safeLtvBps_;
        emit ConfigSet(scenario_, badDebtThresholdBps_, liquidationThresholdBps_, safeLtvBps_);
    }

    function scenario() external view returns (Kaskad.Scenario memory) {
        return _scenario;
    }

    /// @notice Permissionless keeper entry point.
    function refresh() external returns (bool tripped) {
        (bytes32 simId, Kaskad.Result memory r) = engine.simulate(_scenario);
        uint256 badRatio = r.totalDebt == 0 ? 0 : r.badDebt * BPS / r.totalDebt;
        uint256 liqRatio = r.totalDebt == 0 ? 0 : r.totalLiquidated * BPS / r.totalDebt;
        tripped = badRatio > badDebtThresholdBps || (liquidationThresholdBps != 0 && liqRatio > liquidationThresholdBps);
        emit GuardChecked(simId, badRatio, liqRatio, tripped);
        if (tripped) {
            emit GuardTripped(simId, badRatio);
            market.setBorrowPaused(true);
            if (safeLtvBps < market.maxLtvBps()) market.setMaxLtv(safeLtvBps);
        }
    }
}
