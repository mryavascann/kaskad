// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Kaskad} from "./Kaskad.sol";
import {KaskadMC} from "./KaskadMC.sol";

/// @title KaskadMCv3: the same cascade, plus the debt an oracle hides
/// @notice An oracle that does not follow the pool (an exchange rate, a capped feed, a hard peg) keeps
/// valuing collateral above what the market pays for it after a cascade. Positions then look solvent
/// on the oracle while selling their collateral would no longer cover the debt. `hiddenBadDebt` is
/// that gap at the end of the run: bad debt with collateral valued at the pool's spot price, minus
/// bad debt at the oracle's price. With an oracle that follows the pool it is zero.
/// Reads the books of an existing Kaskad (KaskadMC's `source`); the cascade itself is unchanged.
contract KaskadMCv3 is KaskadMC {
    struct Hidden {
        uint256 oraclePrice; // = Result.finalPrice, USD WAD
        uint256 spotPrice; // pool spot price at the end, USD WAD (never above the oracle's)
        uint256 badDebtAtSpot; // USD WAD
        uint256 stuckDebtAtSpot; // USD WAD
        uint256 hiddenBadDebt; // max(0, badDebtAtSpot - Result.badDebt), USD WAD
    }

    constructor(address owner_, Kaskad source_) KaskadMC(owner_, source_) {}

    /// @notice Free dry run (eth_call): the cascade's Result plus the end state valued at the pool's price.
    function previewWithHidden(Scenario calldata s) external view returns (Result memory r, Hidden memory h) {
        return _runWithHidden(s);
    }

    function _runWithHidden(Scenario memory s) internal view returns (Result memory r, Hidden memory h) {
        uint256 g0 = gasleft();
        (AssetConfig memory cfg, uint256 bookDebt) = _validate(s);
        State memory st = _load(s.assetId, s.maxPositions, r);
        _initPool(st, cfg, r.totalDebt, bookDebt);
        uint256[] memory drop = _linearPath(s);
        _cascade(st, s, cfg.priceWad, drop, r, _recoveryBps(s.assetId));

        uint256 finalBase = Math.mulDiv(cfg.priceWad, WAD - drop[s.steps - 1], WAD);
        h.oraclePrice = r.finalPrice;
        h.spotPrice = _impact(finalBase, st.x0, st.x);
        (h.badDebtAtSpot, h.stuckDebtAtSpot) = _badDebt(st, s.maxPositions, h.spotPrice);
        h.hiddenBadDebt = h.badDebtAtSpot > r.badDebt ? h.badDebtAtSpot - r.badDebt : 0;
        r.memoryBytes = _msize();
        r.gasUsed = g0 - gasleft();
    }
}
