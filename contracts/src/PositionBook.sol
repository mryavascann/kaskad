// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice One position packed into a single 32-byte storage slot.
/// bits   0..87   collateral     uint88  dominant collateral amount, 1e6 token units
/// bits  88..175  debt           uint88  total debt, 1e6 USD
/// bits 176..207  otherColl      uint32  other collateral, whole USD (held at a fixed price)
/// bits 208..215  collateralId   uint8   Aave reserve index of the dominant collateral
/// bits 216..231  ltBps          uint16  liquidation threshold (e-mode aware)
/// bits 232..247  bonusBps       uint16  liquidation bonus, extra part (400 = 4%)
/// bits 248..255  eMode          uint8
library PositionLib {
    struct Position {
        uint88 collateral;
        uint88 debt;
        uint32 otherColl;
        uint8 collateralId;
        uint16 ltBps;
        uint16 bonusBps;
        uint8 eMode;
    }

    function pack(Position memory p) internal pure returns (uint256 w) {
        w = uint256(p.collateral) | (uint256(p.debt) << 88) | (uint256(p.otherColl) << 176)
            | (uint256(p.collateralId) << 208) | (uint256(p.ltBps) << 216) | (uint256(p.bonusBps) << 232)
            | (uint256(p.eMode) << 248);
    }

    function unpack(uint256 w) internal pure returns (Position memory p) {
        p.collateral = uint88(w);
        p.debt = uint88(w >> 88);
        p.otherColl = uint32(w >> 176);
        p.collateralId = uint8(w >> 208);
        p.ltBps = uint16(w >> 216);
        p.bonusBps = uint16(w >> 232);
        p.eMode = uint8(w >> 248);
    }
}

/// @notice On-chain position book. One contiguous array per book so that a simulation walks
/// consecutive slots (Monad MIP-8: 128 slots per page, 8,100 gas for the first touch of a page,
/// 100 gas for the rest).
/// A book id is `variant << 8 | assetId`: variant 0 holds the real Aave positions, variant 1 a
/// calibrated book (sampled from the real health-factor distribution, same total debt) used to
/// scale the simulation to many more positions.
abstract contract PositionBook is Ownable2Step {
    uint256 public constant MAX_ASSETS = 16;
    uint256 public constant CALIBRATED = 1 << 8; // book id flag
    uint256 internal constant MAX_BONUS_BPS = 5000;

    struct AssetConfig {
        uint128 priceWad; // oracle price, USD WAD
        uint128 depthUsdWad; // virtual x*y=k pool TVL in USD WAD (price impact)
    }

    struct BookStats {
        uint128 collateral1e6;
        uint128 debt1e6;
        uint128 otherCollUsd;
        uint32 count;
    }

    mapping(uint256 assetId => AssetConfig) public assets;
    mapping(uint256 bookId => BookStats) public bookStats;
    mapping(uint256 bookId => uint256[]) internal _slots; // capacity; live length in bookStats.count

    /// @notice Monad mainnet block the books were built from.
    uint64 public sourceBlock;

    event AssetSet(uint256 indexed assetId, uint256 priceWad, uint256 depthUsdWad);
    event PositionsLoaded(uint256 indexed bookId, uint256 added, uint256 length);
    event BookReset(uint256 indexed bookId);
    event DataInfoSet(uint64 sourceBlock);

    error InvalidAsset(uint256 assetId);
    error InvalidConfig();
    error InvalidPosition(uint256 index);

    constructor(address owner_) Ownable(owner_) {}

    // ------------------------------------------------------------------ owner

    function setAsset(uint256 assetId, uint128 priceWad, uint128 depthUsdWad) external onlyOwner {
        if (assetId >= MAX_ASSETS) revert InvalidAsset(assetId);
        if (priceWad == 0 || depthUsdWad == 0) revert InvalidConfig();
        assets[assetId] = AssetConfig(priceWad, depthUsdWad);
        emit AssetSet(assetId, priceWad, depthUsdWad);
    }

    function setDataInfo(uint64 sourceBlock_) external onlyOwner {
        sourceBlock = sourceBlock_;
        emit DataInfoSet(sourceBlock_);
    }

    /// @notice Append packed positions to an asset's book. Reuses slots left by a reset
    /// (updating a written slot is 100 gas instead of 17,000 state growth).
    function loadPositions(uint256 bookId, uint256[] calldata packed) external onlyOwner {
        uint256 assetId = _assetOf(bookId);
        uint256[] storage slots = _slots[bookId];
        BookStats memory st = bookStats[bookId];
        uint256 len = st.count;
        uint256 cap = slots.length;
        for (uint256 i; i < packed.length; ++i) {
            uint256 w = packed[i];
            PositionLib.Position memory p = PositionLib.unpack(w);
            if (
                p.collateralId != assetId || p.debt == 0 || p.ltBps == 0 || p.ltBps > 10_000
                    || p.bonusBps > MAX_BONUS_BPS
            ) revert InvalidPosition(i);
            if (len < cap) slots[len] = w;
            else slots.push(w);
            unchecked {
                ++len;
            }
            st.collateral1e6 += p.collateral;
            st.debt1e6 += p.debt;
            st.otherCollUsd += p.otherColl;
        }
        st.count = uint32(len);
        bookStats[bookId] = st;
        emit PositionsLoaded(bookId, packed.length, len);
    }

    /// @notice Logically empties a book; storage stays allocated for cheap reloads.
    function resetBook(uint256 bookId) external onlyOwner {
        _assetOf(bookId);
        delete bookStats[bookId];
        emit BookReset(bookId);
    }

    // ------------------------------------------------------------------ views

    function bookLength(uint256 bookId) public view returns (uint256) {
        return bookStats[bookId].count;
    }

    function positionAt(uint256 bookId, uint256 index) external view returns (PositionLib.Position memory) {
        if (index >= bookStats[bookId].count) revert InvalidPosition(index);
        return PositionLib.unpack(_slots[bookId][index]);
    }

    function rawSlot(uint256 bookId, uint256 index) external view returns (uint256) {
        if (index >= bookStats[bookId].count) revert InvalidPosition(index);
        return _slots[bookId][index];
    }

    /// @dev Validates a book id and returns its collateral asset.
    function _assetOf(uint256 bookId) internal pure returns (uint256 assetId) {
        assetId = bookId & 0xff;
        if (assetId >= MAX_ASSETS || bookId > (CALIBRATED | 0xff)) revert InvalidAsset(bookId);
    }
}
