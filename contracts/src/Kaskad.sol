// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PositionBook} from "./PositionBook.sol";

/// @title Kaskad: on-chain liquidation cascade simulator
/// @notice shock -> liquidations -> collateral sold into a virtual x*y=k pool -> lower price ->
/// new liquidations ... until the cascade settles, in a single transaction. The whole engine
/// (book + simulation) lives in one contract and never calls out.
contract Kaskad is PositionBook {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant SCALE_1E6 = 1e12; // 1e6 units -> WAD
    uint256 internal constant CLOSE_FACTOR_HF_THRESHOLD = 0.95e18; // Aave v3.3
    uint256 internal constant MIN_BASE_MAX_CLOSE_FACTOR = 2000e18; // Aave v3.3, USD
    uint256 internal constant LP_MAX = type(uint224).max;
    uint256 internal constant IDX_MASK = 0xffffffff;
    uint256 internal constant MASK88 = (1 << 88) - 1;

    uint256 public constant MAX_STEPS = 100;
    uint256 public constant MAX_ROUNDS = 20;
    uint256 public constant MAX_CURVE_POINTS = 16;

    struct Scenario {
        uint16 assetId; // book id: variant << 8 | Aave reserve index
        uint16 shockBps; // final depeg, 300 = -3%
        uint16 steps; // price path length (blocks)
        uint16 maxRoundsPerStep;
        uint32 maxPositions; // resolution: first N positions of the asset's book
        uint16 oracleFeedbackBps; // 10000: oracle follows the pool price, 0: oracle sees only the shock path
    }

    struct RoundLog {
        uint16 step;
        uint16 round;
        uint32 liquidations;
        uint256 priceWad;
        uint256 liquidatedDebt; // USD WAD
        uint256 seized; // collateral tokens WAD
        uint256 deficit; // cumulative realized bad debt, USD WAD
    }

    struct Result {
        uint256 totalDebt; // debt of the simulated positions, USD WAD
        uint256 totalCollateral; // tokens WAD
        uint256 totalLiquidated; // USD WAD
        uint256 totalSeized; // tokens WAD
        uint256 badDebt; // USD WAD, sum of max(0, debt - collateral value) at the end
        uint256 stuckDebt; // USD WAD, debt still under HF 1 at the end: liquidators could not profit
        uint256 startPrice;
        uint256 finalPrice;
        uint32 rounds;
        uint32 liquidations;
        uint32 positionsUsed;
        uint256 gasUsed;
        uint256 memoryBytes;
        RoundLog[] log;
    }

    struct Summary {
        bytes32 simId;
        uint128 totalDebt;
        uint128 totalLiquidated;
        uint128 badDebt;
        uint128 finalPrice;
        uint64 blockNumber;
        uint32 rounds;
        uint32 positionsUsed;
        uint16 assetId;
        uint16 shockBps;
    }

    /// @dev Mutable cascade state, all in memory.
    struct State {
        uint256[] coll; // WAD tokens
        uint256[] debt; // WAD USD
        uint256[] meta; // other collateral USD WAD << 32 | ltBps << 16 | bonusBps
        uint256[] heap; // max-heap of (liquidation price << 32 | index)
        uint256 heapSize;
        uint256 x0; // pool token reserve at start (WAD)
        uint256 x; // pool token reserve now; USD reserve is base * x0^2 / x
        uint256 base; // external price path at the current step
    }

    mapping(address => uint256) public nonces;
    mapping(address => Summary) public lastResult;

    event Round(
        bytes32 indexed simId,
        uint16 step,
        uint16 round,
        uint256 priceWad,
        uint256 liquidatedDebtUsd,
        uint256 seizedCollateral,
        uint256 badDebtUsd
    );
    event SimulationDone(
        bytes32 indexed simId,
        address indexed sender,
        uint16 assetId,
        uint16 shockBps,
        uint256 totalLiquidated,
        uint256 totalBadDebt,
        uint256 rounds,
        uint256 positionsUsed,
        uint256 gasUsed,
        uint256 memoryBytes
    );

    error InvalidShock();
    error InvalidFeedback();
    error InvalidSteps();
    error InvalidRounds();
    error InvalidPositions(uint256 requested, uint256 available);
    error InvalidCurve();

    constructor(address owner_) PositionBook(owner_) {}

    // ------------------------------------------------------------------ external

    /// @notice Runs a scenario, stores a summary in the caller's own slot and emits the rounds.
    function simulate(Scenario calldata s) external returns (bytes32 simId, Result memory r) {
        r = _run(s);
        uint256 nonce = nonces[msg.sender]++;
        simId = keccak256(abi.encode(msg.sender, nonce));
        lastResult[msg.sender] = Summary({
            simId: simId,
            totalDebt: uint128(r.totalDebt),
            totalLiquidated: uint128(r.totalLiquidated),
            badDebt: uint128(r.badDebt),
            finalPrice: uint128(r.finalPrice),
            blockNumber: uint64(block.number),
            rounds: r.rounds,
            positionsUsed: r.positionsUsed,
            assetId: s.assetId,
            shockBps: s.shockBps
        });
        RoundLog[] memory log = r.log;
        for (uint256 i; i < log.length; ++i) {
            RoundLog memory l = log[i];
            emit Round(simId, l.step, l.round, l.priceWad, l.liquidatedDebt, l.seized, l.deficit);
        }
        emit SimulationDone(
            simId,
            msg.sender,
            s.assetId,
            s.shockBps,
            r.totalLiquidated,
            r.badDebt,
            r.rounds,
            r.positionsUsed,
            r.gasUsed,
            r.memoryBytes
        );
    }

    /// @notice Free dry run (eth_call). Also reports gas and memory used by the engine.
    function preview(Scenario calldata s) external view returns (Result memory) {
        return _run(s);
    }

    /// @notice Stress curve: the same scenario for several shock levels in one call. Every
    /// point gets its own copy of the cascade state, so memory grows with points x positions.
    function previewCurve(Scenario calldata s, uint16[] calldata shocks)
        external
        view
        returns (uint256[] memory badDebt, uint256[] memory liquidated, uint256 gasUsed, uint256 memoryBytes)
    {
        uint256 g0 = gasleft();
        if (shocks.length == 0 || shocks.length > MAX_CURVE_POINTS) revert InvalidCurve();
        badDebt = new uint256[](shocks.length);
        liquidated = new uint256[](shocks.length);
        Scenario memory sc = s;
        for (uint256 i; i < shocks.length; ++i) {
            sc.shockBps = shocks[i];
            Result memory r = _run(sc);
            badDebt[i] = r.badDebt;
            liquidated[i] = r.totalLiquidated;
        }
        gasUsed = g0 - gasleft();
        memoryBytes = _msize();
    }

    // ------------------------------------------------------------------ engine

    /// @dev Where a book lives: price/depth config, live length and total debt (1e6 USD).
    /// KaskadMC overrides this to read another Kaskad's book.
    function _bookInfo(uint256 bookId)
        internal
        view
        virtual
        returns (AssetConfig memory cfg, uint256 count, uint256 debt1e6)
    {
        cfg = assets[_assetOf(bookId)];
        BookStats storage b = bookStats[bookId];
        (count, debt1e6) = (b.count, b.debt1e6);
    }

    function _validate(Scenario memory s) internal view returns (AssetConfig memory cfg, uint256 bookDebt) {
        uint256 available;
        (cfg, available, bookDebt) = _bookInfo(s.assetId);
        bookDebt *= SCALE_1E6;
        if (cfg.priceWad == 0) revert InvalidAsset(s.assetId);
        if (s.shockBps > BPS) revert InvalidShock();
        if (s.oracleFeedbackBps > BPS) revert InvalidFeedback();
        if (s.steps == 0 || s.steps > MAX_STEPS) revert InvalidSteps();
        if (s.maxRoundsPerStep == 0 || s.maxRoundsPerStep > MAX_ROUNDS) revert InvalidRounds();
        if (s.maxPositions == 0 || s.maxPositions > available) revert InvalidPositions(s.maxPositions, available);
    }

    function _run(Scenario memory s) internal view returns (Result memory r) {
        uint256 g0 = gasleft();
        (AssetConfig memory cfg, uint256 bookDebt) = _validate(s);
        State memory st = _load(s.assetId, s.maxPositions, r);
        _initPool(st, cfg, r.totalDebt, bookDebt);
        _cascade(st, s, cfg.priceWad, _linearPath(s), r, _recoveryBps(s.assetId));
        r.memoryBytes = _msize();
        r.gasUsed = g0 - gasleft();
    }

    /// @dev Share of the pool's displacement that arbitrage closes between blocks (bps). 0 here:
    /// the pool never recovers within the scenario. KaskadMC sets it per asset.
    function _recoveryBps(uint256) internal view virtual returns (uint256) {
        return 0;
    }

    /// @dev Virtual constant-product pool: x tokens against depth/2 USD. At partial resolution the
    /// depth is scaled by the simulated share of the book's debt, so sold/depth stays representative.
    function _initPool(State memory st, AssetConfig memory cfg, uint256 simDebt, uint256 bookDebt) internal pure {
        uint256 depth = Math.mulDiv(cfg.depthUsdWad, simDebt, bookDebt);
        uint256 x0 = Math.mulDiv(depth, WAD, 2 * cfg.priceWad);
        if (x0 == 0) x0 = 1;
        st.x0 = x0;
        st.x = x0;
    }

    /// @dev Straight-line depeg: drop[step-1] = shock * step / steps, as a WAD fraction of p0.
    function _linearPath(Scenario memory s) internal pure returns (uint256[] memory drop) {
        drop = new uint256[](s.steps);
        for (uint256 i; i < s.steps; ++i) {
            drop[i] = uint256(s.shockBps) * (i + 1) * WAD / (BPS * s.steps);
        }
    }

    /// @dev Runs the cascade along an external price path (cumulative WAD drops, non-decreasing,
    /// each <= 1e18) and fills the result fields. Between blocks, arbitrage pulls the pool back
    /// toward the external price by `recovery` bps of its displacement.
    function _cascade(
        State memory st,
        Scenario memory s,
        uint256 p0,
        uint256[] memory drop,
        Result memory r,
        uint256 recovery
    ) internal pure {
        uint256 n = s.maxPositions;
        r.positionsUsed = uint32(n);
        r.startPrice = p0;
        RoundLog[] memory log = new RoundLog[](uint256(s.steps) * s.maxRoundsPerStep);
        uint256 nLog;
        uint256[] memory pending = new uint256[](n);
        uint256 deficit;
        uint256 price = p0;
        uint256 x0 = st.x0;

        for (uint256 step = 1; step <= s.steps; ++step) {
            if (recovery > 0 && st.x > x0) st.x = x0 + Math.mulDiv(st.x - x0, BPS - recovery, BPS);
            st.base = Math.mulDiv(p0, WAD - drop[step - 1], WAD);
            for (uint256 round; round < s.maxRoundsPerStep; ++round) {
                // oracle is read once per round (liquidation wave): the shock path, pulled toward
                // the pool's spot price by the feedback share
                uint256 spot = _impact(st.base, x0, st.x);
                price = st.base - Math.mulDiv(st.base - spot, s.oracleFeedbackBps, BPS);
                if (price == 0) break;
                (uint256 liq, uint256 seized, uint256 cnt, uint256 def) = _liquidateRound(st, price, pending);
                deficit += def;
                if (cnt == 0) break;
                r.totalLiquidated += liq;
                r.totalSeized += seized;
                r.liquidations += uint32(cnt);
                log[nLog++] = RoundLog({
                    step: uint16(step),
                    round: uint16(round),
                    liquidations: uint32(cnt),
                    priceWad: price,
                    liquidatedDebt: liq,
                    seized: seized,
                    deficit: deficit
                });
            }
            if (price == 0) break;
        }

        uint256 finalBase = Math.mulDiv(p0, WAD - drop[s.steps - 1], WAD);
        r.finalPrice = finalBase - Math.mulDiv(finalBase - _impact(finalBase, x0, st.x), s.oracleFeedbackBps, BPS);
        (r.badDebt, r.stuckDebt) = _badDebt(st, n, r.finalPrice);
        r.rounds = uint32(nLog);
        assembly ("memory-safe") {
            mstore(log, nLog)
        }
        r.log = log;
    }

    /// @dev Loads the first n positions of a book into memory and heapifies them by liquidation price.
    function _load(uint256 assetId, uint256 n, Result memory r) internal view virtual returns (State memory st) {
        st.coll = new uint256[](n);
        st.debt = new uint256[](n);
        st.meta = new uint256[](n);
        st.heap = new uint256[](n);
        st.heapSize = n;
        uint256[] storage src = _slots[assetId];
        uint256 base;
        assembly ("memory-safe") {
            mstore(0, src.slot)
            base := keccak256(0, 0x20)
        }
        (uint256[] memory coll, uint256[] memory debt, uint256[] memory meta, uint256[] memory heap) =
            (st.coll, st.debt, st.meta, st.heap);
        uint256 totalDebt;
        uint256 totalColl;
        // Hot loop: consecutive slots (MIP-8 pages), no bounds checks. n <= book length is
        // validated; packed fields bound every product below far under 2^256.
        unchecked {
            for (uint256 i; i < n; ++i) {
                uint256 w;
                assembly ("memory-safe") {
                    w := sload(add(base, i))
                }
                uint256 c = (w & MASK88) * SCALE_1E6;
                uint256 d = ((w >> 88) & MASK88) * SCALE_1E6;
                uint256 m =
                    (((w >> 176) & 0xffffffff) * WAD) << 32 | ((w >> 216) & 0xffff) << 16 | ((w >> 232) & 0xffff);
                uint256 key = _lp(c, d, m) << 32 | i;
                assembly ("memory-safe") {
                    let off := shl(5, add(i, 1))
                    mstore(add(coll, off), c)
                    mstore(add(debt, off), d)
                    mstore(add(meta, off), m)
                    mstore(add(heap, off), key)
                }
                totalDebt += d;
                totalColl += c;
            }
        }
        r.totalDebt = totalDebt;
        r.totalCollateral = totalColl;
        if (n > 1) {
            for (uint256 i = n / 2; i > 0; --i) {
                _siftDown(st.heap, i - 1, n);
            }
        }
    }

    /// @dev Liquidates every position whose liquidation price is above `price`, once per round.
    /// Each liquidation sells its seizure into the pool right away (the pool moves within the
    /// round, the oracle does not).
    function _liquidateRound(State memory st, uint256 price, uint256[] memory pending)
        internal
        pure
        returns (uint256 liq, uint256 seized, uint256 cnt, uint256 def)
    {
        uint256[] memory heap = st.heap;
        uint256 size = st.heapSize;
        uint256 np;
        while (size > 0) {
            uint256 top = heap[0];
            if (top >> 32 <= price) break;
            // pop
            unchecked {
                --size;
            }
            heap[0] = heap[size];
            _siftDown(heap, 0, size);

            uint256 i = top & IDX_MASK;
            (uint256 repay, uint256 seize, uint256 d) = _liquidate(st, i, price);
            if (repay == 0) {
                // pool too thin to liquidate at a profit: this wave is over
                pending[np++] = top;
                break;
            }
            liq += repay;
            seized += seize;
            ++cnt;
            uint256 c = st.coll[i];
            if (c > 0 && st.debt[i] > 0) {
                pending[np++] = _lp(c, st.debt[i], st.meta[i]) << 32 | i;
            } else {
                def += d;
            }
        }
        // re-insert after the round so a position is hit at most once per round
        for (uint256 k; k < np; ++k) {
            heap[size] = pending[k];
            _siftUp(heap, size);
            unchecked {
                ++size;
            }
        }
        st.heapSize = size;
    }

    /// @dev Aave v3.3 style liquidation of position i at oracle `price`, capped by liquidator
    /// profitability: selling dx into the pool (x, y) must return at least the repaid debt,
    /// y * dx / (x + dx) >= dx * price / (1 + bonus)  <=>  x + dx <= y * (1 + bonus) / price.
    /// Returns repaid debt, seized collateral and the realized deficit if collateral ran out.
    function _liquidate(State memory st, uint256 i, uint256 price)
        internal
        pure
        returns (uint256 repay, uint256 seize, uint256 deficit)
    {
        uint256 c = st.coll[i];
        uint256 d = st.debt[i];
        uint256 m = st.meta[i];
        uint256 other = m >> 32;
        uint256 lt = uint16(m >> 16);
        uint256 bonus = uint16(m);

        uint256 collVal = Math.mulDiv(c, price, WAD);
        uint256 hf = Math.mulDiv((collVal + other) * lt, WAD, d * BPS);
        bool full =
            hf < CLOSE_FACTOR_HF_THRESHOLD || d < MIN_BASE_MAX_CLOSE_FACTOR || collVal < MIN_BASE_MAX_CLOSE_FACTOR;
        repay = full ? d : d / 2;
        seize = Math.mulDiv(repay * (BPS + bonus), WAD, BPS * price);
        if (seize >= c) {
            seize = c;
            repay = Math.mulDiv(collVal, BPS, BPS + bonus);
            if (repay > d) repay = d;
        }
        uint256 x = st.x;
        uint256 y = Math.mulDiv(Math.mulDiv(st.base, st.x0, x), st.x0, WAD);
        uint256 xMax = Math.mulDiv(y * (BPS + bonus), WAD, BPS * price);
        uint256 cap = xMax > x ? xMax - x : 0;
        if (seize > cap) {
            seize = cap; // partial liquidation up to break-even, 0 = stuck this round
            repay = Math.mulDiv(seize * BPS, price, (BPS + bonus) * WAD);
            if (seize == 0 || repay == 0) return (0, 0, 0);
        }
        st.x = x + seize;
        c -= seize;
        d -= repay;
        st.coll[i] = c;
        st.debt[i] = d;
        if (c == 0 && d > other) deficit = d - other;
    }

    /// @dev Price below which the position's health factor drops under 1. lt > 0 is enforced
    /// on load; d <= 2^88 * 1e12 so none of the products overflow.
    function _lp(uint256 c, uint256 d, uint256 m) internal pure returns (uint256 lp) {
        unchecked {
            uint256 other = m >> 32;
            uint256 need = d * BPS / ((m >> 16) & 0xffff);
            if (need <= other || c == 0) return 0; // c == 0: nothing left to seize, counted as bad debt
            lp = (need - other) * WAD / c;
            if (lp > LP_MAX) lp = LP_MAX;
        }
    }

    /// @dev Constant-product price impact: price scales with (x0 / x)^2.
    function _impact(uint256 base, uint256 x0, uint256 x) internal pure returns (uint256) {
        return Math.mulDiv(Math.mulDiv(base, x0, x), x0, x);
    }

    /// @dev coll <= 2^88 * 1e12 and price <= 2^128, so coll * price < 2^256.
    function _badDebt(State memory st, uint256 n, uint256 price) internal pure returns (uint256 bad, uint256 stuck) {
        (uint256[] memory coll, uint256[] memory debt, uint256[] memory meta) = (st.coll, st.debt, st.meta);
        unchecked {
            for (uint256 i; i < n; ++i) {
                uint256 c;
                uint256 d;
                uint256 m;
                assembly ("memory-safe") {
                    let off := shl(5, add(i, 1))
                    c := mload(add(coll, off))
                    d := mload(add(debt, off))
                    m := mload(add(meta, off))
                }
                uint256 v = c * price / WAD + (m >> 32);
                if (d > v) bad += d - v;
                else if (v * ((m >> 16) & 0xffff) < d * BPS) stuck += d;
            }
        }
    }

    /// @dev Max-heap sift down on h[0..size). Caller guarantees i < size <= h.length.
    function _siftDown(uint256[] memory h, uint256 i, uint256 size) internal pure {
        assembly ("memory-safe") {
            let data := add(h, 0x20)
            let v := mload(add(data, shl(5, i)))
            for {} 1 {} {
                let l := add(shl(1, i), 1)
                if iszero(lt(l, size)) { break }
                let cv := mload(add(data, shl(5, l)))
                let r := add(l, 1)
                if lt(r, size) {
                    let rv := mload(add(data, shl(5, r)))
                    if gt(rv, cv) {
                        l := r
                        cv := rv
                    }
                }
                if iszero(gt(cv, v)) { break }
                mstore(add(data, shl(5, i)), cv)
                i := l
            }
            mstore(add(data, shl(5, i)), v)
        }
    }

    /// @dev Max-heap sift up. Caller guarantees i < h.length.
    function _siftUp(uint256[] memory h, uint256 i) internal pure {
        assembly ("memory-safe") {
            let data := add(h, 0x20)
            let v := mload(add(data, shl(5, i)))
            for {} i {} {
                let p := shr(1, sub(i, 1))
                let pv := mload(add(data, shl(5, p)))
                if iszero(lt(pv, v)) { break }
                mstore(add(data, shl(5, i)), pv)
                i := p
            }
            mstore(add(data, shl(5, i)), v)
        }
    }

    /// @dev High-water mark of allocated memory (free memory pointer). msize() itself is
    /// not allowed with the Yul optimizer; everything here is memory-safe so they match.
    function _msize() internal pure returns (uint256 m) {
        assembly ("memory-safe") {
            m := mload(0x40)
        }
    }
}
