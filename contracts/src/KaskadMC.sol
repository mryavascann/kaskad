// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Kaskad} from "./Kaskad.sol";

/// @title KaskadMC: Monte Carlo stress test in one transaction
/// @notice Runs K random depeg paths over every position of a book held by an existing Kaskad
/// deployment and reports the distribution of bad debt (mean, 95th percentile, worst).
/// Path k: final shock = S * 3u^2 (u uniform in [0,1): mean S, at most 3S, capped at 100%), spread
/// over the steps with random non-decreasing increments. Deterministic in (seed, k).
/// Memory does not grow with K: every path works on a fresh copy of the loaded book and the free
/// memory pointer is rewound afterwards, so only the K result words accumulate.
contract KaskadMC is Kaskad {
    uint256 public constant MAX_PATHS = 2_000;

    Kaskad public immutable source;

    /// @notice Per-asset arbitrage recovery between blocks (bps of the pool's displacement).
    /// An assumption about external liquidity (CEX / mint-redeem), set by the owner.
    mapping(uint256 assetId => uint16) public recoveryBps;

    event RecoverySet(uint256 indexed assetId, uint16 bps);

    struct MCResult {
        uint256 paths;
        uint256 positionsUsed;
        uint256 totalDebt; // USD WAD
        uint256 meanBadDebt;
        uint256 p95BadDebt;
        uint256 worstBadDebt;
        uint256 lossPaths; // paths with any bad debt
        uint256 meanShockBps;
        uint256 worstShockBps; // shock of the worst path
        uint256 gasUsed;
        uint256 memoryBytes;
        uint256[] badDebt; // per path, in path order
        uint256[] shockBps; // per path
    }

    event MonteCarloDone(
        bytes32 indexed simId,
        address indexed sender,
        uint16 assetId,
        uint16 meanShockBps,
        uint256 paths,
        uint256 meanBadDebt,
        uint256 p95BadDebt,
        uint256 worstBadDebt,
        uint256 gasUsed,
        uint256 memoryBytes
    );

    error InvalidPaths();
    error InvalidRecovery();

    function setRecovery(uint256 assetId, uint16 bps) external onlyOwner {
        if (assetId >= MAX_ASSETS) revert InvalidAsset(assetId);
        if (bps > BPS) revert InvalidRecovery();
        recoveryBps[assetId] = bps;
        emit RecoverySet(assetId, bps);
    }

    constructor(address owner_, Kaskad source_) Kaskad(owner_) {
        source = source_;
    }

    /// @notice Free dry run (eth_call).
    function previewMC(Scenario calldata s, uint256 paths, uint256 seed) external view returns (MCResult memory) {
        return _monteCarlo(s, paths, seed);
    }

    /// @notice On-chain run: emits the distribution; writes nothing but the caller's nonce.
    function simulateMC(Scenario calldata s, uint256 paths, uint256 seed)
        external
        returns (bytes32 simId, MCResult memory r)
    {
        r = _monteCarlo(s, paths, seed);
        uint256 nonce = nonces[msg.sender]++;
        simId = keccak256(abi.encode(msg.sender, nonce, "mc"));
        emit MonteCarloDone(
            simId,
            msg.sender,
            s.assetId,
            s.shockBps,
            r.paths,
            r.meanBadDebt,
            r.p95BadDebt,
            r.worstBadDebt,
            r.gasUsed,
            r.memoryBytes
        );
    }

    // ------------------------------------------------------------------ engine

    function _monteCarlo(Scenario memory s, uint256 paths, uint256 seed) internal view returns (MCResult memory mc) {
        uint256 g0 = gasleft();
        if (paths == 0 || paths > MAX_PATHS) revert InvalidPaths();
        (AssetConfig memory cfg, uint256 bookDebt) = _validate(s);
        uint256 n = s.maxPositions;

        Result memory base;
        State memory tmpl = _load(s.assetId, n, base);
        _initPool(tmpl, cfg, base.totalDebt, bookDebt);

        mc.paths = paths;
        mc.positionsUsed = n;
        mc.totalDebt = base.totalDebt;
        mc.badDebt = new uint256[](paths);
        mc.shockBps = new uint256[](paths);

        uint256 recovery = _recoveryBps(s.assetId);
        uint256 sumBad;
        uint256 sumShock;
        for (uint256 k; k < paths; ++k) {
            uint256 fmp;
            assembly ("memory-safe") {
                fmp := mload(0x40)
            }
            (uint256[] memory drop, uint256 shock) = _randomPath(s, seed, k);
            State memory st = _clone(tmpl, n);
            Result memory r;
            _cascade(st, s, cfg.priceWad, drop, r, recovery);
            mc.badDebt[k] = r.badDebt;
            mc.shockBps[k] = shock;
            sumBad += r.badDebt;
            sumShock += shock;
            if (r.badDebt > 0) ++mc.lossPaths;
            if (r.badDebt > mc.worstBadDebt || k == 0) {
                mc.worstBadDebt = r.badDebt;
                mc.worstShockBps = shock;
            }
            // everything this path allocated is garbage now: reuse the memory
            assembly ("memory-safe") {
                mstore(0x40, fmp)
            }
        }
        mc.meanBadDebt = sumBad / paths;
        mc.meanShockBps = sumShock / paths;
        mc.p95BadDebt = _percentile(mc.badDebt, 95);
        mc.memoryBytes = _msize();
        mc.gasUsed = g0 - gasleft();
    }

    /// @dev Random non-decreasing path: cumulative WAD drops per step.
    function _randomPath(Scenario memory s, uint256 seed, uint256 k)
        internal
        pure
        returns (uint256[] memory drop, uint256 shockBps)
    {
        uint256 rnd = uint256(keccak256(abi.encode(seed, k)));
        uint256 u = rnd % 1e6; // [0, 1) in 1e6
        shockBps = uint256(s.shockBps) * 3 * u * u / 1e12;
        if (shockBps > BPS) shockBps = BPS;
        uint256 steps = s.steps;
        drop = new uint256[](steps);
        uint256 total;
        for (uint256 i; i < steps; ++i) {
            uint256 w = 1 + (uint256(keccak256(abi.encode(rnd, i))) % 1_000);
            total += w;
            drop[i] = total;
        }
        for (uint256 i; i < steps; ++i) {
            drop[i] = shockBps * WAD * drop[i] / (BPS * total);
        }
    }

    /// @dev Fresh mutable copy of the loaded book (MCOPY); meta is read-only and shared.
    function _clone(State memory t, uint256 n) internal pure returns (State memory st) {
        st.coll = _copy(t.coll, n);
        st.debt = _copy(t.debt, n);
        st.heap = _copy(t.heap, n);
        st.meta = t.meta;
        st.heapSize = n;
        st.x0 = t.x0;
        st.x = t.x0;
    }

    function _copy(uint256[] memory a, uint256 n) internal pure returns (uint256[] memory b) {
        b = new uint256[](n);
        assembly ("memory-safe") {
            mcopy(add(b, 0x20), add(a, 0x20), shl(5, n))
        }
    }

    /// @dev Nearest-rank percentile on a sorted copy (heapsort, reusing the engine's max-heap).
    function _percentile(uint256[] memory xs, uint256 pct) internal pure returns (uint256) {
        uint256 n = xs.length;
        uint256[] memory h = _copy(xs, n);
        for (uint256 i = n / 2; i > 0; --i) {
            _siftDown(h, i - 1, n);
        }
        for (uint256 end = n; end > 1; --end) {
            (h[0], h[end - 1]) = (h[end - 1], h[0]);
            _siftDown(h, 0, end - 1);
        }
        uint256 rank = (pct * n + 99) / 100; // ceil, 1-based
        return h[rank - 1];
    }

    // ------------------------------------------------------------------ book source

    function _recoveryBps(uint256 bookId) internal view override returns (uint256) {
        return recoveryBps[bookId & 0xff];
    }

    function _bookInfo(uint256 bookId)
        internal
        view
        override
        returns (AssetConfig memory cfg, uint256 count, uint256 debt1e6)
    {
        _assetOf(bookId);
        (cfg.priceWad, cfg.depthUsdWad) = source.assets(bookId & 0xff);
        (, uint128 debt,, uint32 cnt) = source.bookStats(bookId);
        (count, debt1e6) = (cnt, debt);
    }

    /// @dev Same decoding as Kaskad._load, reading the source contract's slots.
    function _load(uint256 bookId, uint256 n, Result memory r) internal view override returns (State memory st) {
        st.coll = new uint256[](n);
        st.debt = new uint256[](n);
        st.meta = new uint256[](n);
        st.heap = new uint256[](n);
        st.heapSize = n;
        uint256 totalDebt;
        uint256 totalColl;
        for (uint256 i; i < n; ++i) {
            uint256 w = source.rawSlot(bookId, i);
            uint256 c = (w & MASK88) * SCALE_1E6;
            uint256 d = ((w >> 88) & MASK88) * SCALE_1E6;
            uint256 m = (((w >> 176) & 0xffffffff) * WAD) << 32 | ((w >> 216) & 0xffff) << 16 | ((w >> 232) & 0xffff);
            st.coll[i] = c;
            st.debt[i] = d;
            st.meta[i] = m;
            st.heap[i] = _lp(c, d, m) << 32 | i;
            totalDebt += d;
            totalColl += c;
        }
        r.totalDebt = totalDebt;
        r.totalCollateral = totalColl;
        for (uint256 i = n / 2; i > 0; --i) {
            _siftDown(st.heap, i - 1, n);
        }
    }
}
