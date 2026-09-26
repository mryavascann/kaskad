// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Kaskad} from "../src/Kaskad.sol";
import {KaskadMC} from "../src/KaskadMC.sol";

/// @notice Diagnostics only (local fork, never deployed to a network): runs the same cascade as
/// KaskadMC.preview and returns the per-position state before and after, plus the pool state.
contract Probe is KaskadMC {
    constructor(address owner_, Kaskad source_) KaskadMC(owner_, source_) {}

    struct ProbeOut {
        uint256[] coll0;
        uint256[] debt0;
        uint256[] coll;
        uint256[] debt;
        uint256[] meta;
        uint256 startPrice;
        uint256 finalPrice;
        uint256 x0;
        uint256 xEnd;
        uint256 baseEnd;
        uint256 badDebt;
        uint256 stuckDebt;
        uint256 rounds;
        uint256 liquidations;
    }

    function probe(Scenario calldata s) external view returns (ProbeOut memory o) {
        (AssetConfig memory cfg, uint256 bookDebt) = _validate(s);
        Result memory r;
        State memory st = _load(s.assetId, s.maxPositions, r);
        o.coll0 = _copy(st.coll, s.maxPositions);
        o.debt0 = _copy(st.debt, s.maxPositions);
        _initPool(st, cfg, r.totalDebt, bookDebt);
        _cascade(st, s, cfg.priceWad, _linearPath(s), r, _recoveryBps(s.assetId));
        o.coll = st.coll;
        o.debt = st.debt;
        o.meta = st.meta;
        o.startPrice = r.startPrice;
        o.finalPrice = r.finalPrice;
        o.x0 = st.x0;
        o.xEnd = st.x;
        o.baseEnd = st.base;
        o.badDebt = r.badDebt;
        o.stuckDebt = r.stuckDebt;
        o.rounds = r.rounds;
        o.liquidations = r.liquidations;
    }
}
