// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Kaskad} from "./Kaskad.sol";
import {KaskadMCv3} from "./KaskadMCv3.sol";

/// @title RiskOracle: Kaskad's stress results as an on-chain risk feed
/// @notice Anyone may call `publish(asset)`: it runs the asset's real book through four standard shocks
/// on KaskadMCv3 in the same transaction, stores one report per shock, and updates a bounded
/// recommendation: at risk or not, and a max LTV that moves at most `ltvStepBps` per publish between a
/// governance-set floor and ceiling (the "optimistic, bounded update" model of risk oracles). Contracts
/// read `latest` / `state` and act on them (GuardV2, RiskVault).
contract RiskOracle is Ownable2Step {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;
    /// @notice Largest move of the recommended LTV per publish.
    uint16 public constant MAX_LTV_STEP_BPS = 500;
    uint256 public constant SHOCK_COUNT = 4;

    struct Rule {
        bool enabled;
        uint16 steps; // blocks of the shock path
        uint16 rounds; // liquidation waves per block
        uint32 maxPositions; // 0 = the whole book as it stands at publish time
        uint16 oracleFeedbackBps; // 0: the market's oracle follows an external price; 10000: the pool
        uint16 triggerShockBps; // which report decides "at risk" (one of shocks())
        uint16 lossThresholdBps; // (bad + hidden) / debt above this: at risk
        uint16 stuckThresholdBps; // stuck / debt above this: at risk (0 = ignore stuck debt)
        uint16 ltvFloorBps;
        uint16 ltvCeilingBps;
        uint16 ltvStepBps;
        uint32 minInterval; // seconds between publishes for this asset
    }

    struct Report {
        uint64 publishedAt;
        uint64 blockNumber;
        uint32 positions;
        uint128 totalDebt; // USD WAD
        uint128 badDebt;
        uint128 stuckDebt;
        uint128 hiddenBadDebt;
        uint128 liquidated;
        uint128 oraclePrice;
        uint128 spotPrice;
    }

    struct State {
        bool atRisk;
        uint16 recommendedLtvBps;
        uint64 lastPublished;
        uint16 lossBps; // trigger report: (bad + hidden) / debt
        uint16 stuckBps; // trigger report: stuck / debt
    }

    KaskadMCv3 public immutable engine;
    mapping(uint256 assetId => Rule) internal _rules;
    mapping(uint256 assetId => State) public state;
    mapping(uint256 assetId => mapping(uint256 shockBps => Report)) internal _reports;

    event RuleSet(uint16 indexed assetId, Rule rule);
    event RiskPublished(uint16 indexed assetId, uint16 shockBps, Report report);
    event Recommendation(
        uint16 indexed assetId, bool atRisk, uint16 recommendedLtvBps, uint16 lossBps, uint16 stuckBps
    );

    error InvalidRule();
    error AssetNotEnabled(uint16 assetId);
    error TooSoon(uint64 nextAt);

    constructor(address owner_, KaskadMCv3 engine_) Ownable(owner_) {
        engine = engine_;
    }

    /// @notice The four standard shocks, in bps of the dominant collateral's price.
    function shocks() public pure returns (uint16[SHOCK_COUNT] memory s) {
        s = [uint16(100), 300, 1_000, 2_000];
    }

    function rule(uint16 assetId) external view returns (Rule memory) {
        return _rules[assetId];
    }

    function latest(uint16 assetId, uint16 shockBps) external view returns (Report memory) {
        return _reports[assetId][shockBps];
    }

    function setRule(uint16 assetId, Rule calldata r) external onlyOwner {
        bool knownShock;
        uint16[SHOCK_COUNT] memory s = shocks();
        for (uint256 i; i < SHOCK_COUNT; ++i) {
            if (s[i] == r.triggerShockBps) knownShock = true;
        }
        if (
            !knownShock || r.steps == 0 || r.rounds == 0 || r.oracleFeedbackBps > BPS || r.lossThresholdBps > BPS
                || r.stuckThresholdBps > BPS || r.ltvFloorBps > r.ltvCeilingBps || r.ltvCeilingBps > BPS
                || r.ltvStepBps == 0 || r.ltvStepBps > MAX_LTV_STEP_BPS
        ) revert InvalidRule();
        _rules[assetId] = r;
        State storage st = state[assetId];
        if (st.recommendedLtvBps == 0 || st.recommendedLtvBps > r.ltvCeilingBps || st.recommendedLtvBps < r.ltvFloorBps)
        {
            st.recommendedLtvBps = r.ltvCeilingBps;
        }
        emit RuleSet(assetId, r);
    }

    /// @notice Permissionless: runs the four shocks, stores the reports, updates the recommendation.
    function publish(uint16 assetId) external returns (bool atRisk, uint16 recommendedLtvBps) {
        Rule memory r = _rules[assetId];
        if (!r.enabled) revert AssetNotEnabled(assetId);
        State memory st = state[assetId];
        if (st.lastPublished != 0 && block.timestamp < uint256(st.lastPublished) + r.minInterval) {
            revert TooSoon(uint64(uint256(st.lastPublished) + r.minInterval));
        }
        uint32 n = r.maxPositions;
        if (n == 0) (,,, n) = engine.source().bookStats(assetId);

        uint16[SHOCK_COUNT] memory s = shocks();
        Report memory trigger;
        for (uint256 i; i < SHOCK_COUNT; ++i) {
            Report memory rep = _run(assetId, s[i], n, r);
            _reports[assetId][s[i]] = rep;
            emit RiskPublished(assetId, s[i], rep);
            if (s[i] == r.triggerShockBps) trigger = rep;
        }

        uint256 debt = trigger.totalDebt;
        st.lossBps = debt == 0 ? 0 : uint16(_min((uint256(trigger.badDebt) + trigger.hiddenBadDebt) * BPS / debt, BPS));
        st.stuckBps = debt == 0 ? 0 : uint16(_min(uint256(trigger.stuckDebt) * BPS / debt, BPS));
        atRisk = st.lossBps > r.lossThresholdBps || (r.stuckThresholdBps != 0 && st.stuckBps > r.stuckThresholdBps);
        uint256 ltv = st.recommendedLtvBps;
        ltv = atRisk
            ? (ltv > uint256(r.ltvFloorBps) + r.ltvStepBps ? ltv - r.ltvStepBps : r.ltvFloorBps)
            : _min(ltv + r.ltvStepBps, r.ltvCeilingBps);
        recommendedLtvBps = uint16(ltv);
        st.atRisk = atRisk;
        st.recommendedLtvBps = recommendedLtvBps;
        st.lastPublished = uint64(block.timestamp);
        state[assetId] = st;
        emit Recommendation(assetId, atRisk, recommendedLtvBps, st.lossBps, st.stuckBps);
    }

    function _run(uint16 assetId, uint16 shockBps, uint32 n, Rule memory r) internal view returns (Report memory rep) {
        (Kaskad.Result memory res, KaskadMCv3.Hidden memory h) = engine.previewWithHidden(
            Kaskad.Scenario({
                assetId: assetId,
                shockBps: shockBps,
                steps: r.steps,
                maxRoundsPerStep: r.rounds,
                maxPositions: n,
                oracleFeedbackBps: r.oracleFeedbackBps
            })
        );
        rep = Report({
            publishedAt: uint64(block.timestamp),
            blockNumber: uint64(block.number),
            positions: n,
            totalDebt: uint128(res.totalDebt),
            badDebt: uint128(res.badDebt),
            stuckDebt: uint128(res.stuckDebt),
            hiddenBadDebt: uint128(h.hiddenBadDebt),
            liquidated: uint128(res.totalLiquidated),
            oraclePrice: uint128(h.oraclePrice),
            spotPrice: uint128(h.spotPrice)
        });
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
