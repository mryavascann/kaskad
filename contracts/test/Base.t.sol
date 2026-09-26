// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Kaskad} from "../src/Kaskad.sol";
import {PositionLib} from "../src/PositionBook.sol";

abstract contract Base is Test {
    uint256 internal constant WAD = 1e18;
    uint16 internal constant SYRUP = 9;
    uint16 internal constant PT = 12;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    Kaskad internal kaskad;

    function setUp() public virtual {
        kaskad = new Kaskad(owner);
        vm.startPrank(owner);
        kaskad.setAsset(SYRUP, 1e18, 1e30); // effectively infinite depth unless overridden
        kaskad.setAsset(PT, 1e18, 1e30);
        vm.stopPrank();
    }

    function _pos(uint16 assetId, uint256 collTokens1e6, uint256 debtUsd1e6, uint32 otherUsd, uint16 lt, uint16 bonus)
        internal
        pure
        returns (uint256)
    {
        return PositionLib.pack(
            PositionLib.Position({
                collateral: uint88(collTokens1e6),
                debt: uint88(debtUsd1e6),
                otherColl: otherUsd,
                collateralId: uint8(assetId),
                ltBps: lt,
                bonusBps: bonus,
                eMode: 1
            })
        );
    }

    function _load(uint16 assetId, uint256 w) internal {
        uint256[] memory a = new uint256[](1);
        a[0] = w;
        vm.prank(owner);
        kaskad.loadPositions(assetId, a);
    }

    /// @dev Deterministic synthetic e-mode book: HF spread over [1.00, 1.30), sizes $3k..$3M.
    function _synthetic(uint16 assetId, uint256 from, uint256 n, uint256 seed)
        internal
        pure
        returns (uint256[] memory out)
    {
        out = new uint256[](n);
        for (uint256 k; k < n; ++k) {
            uint256 r = uint256(keccak256(abi.encode(seed, from + k)));
            uint256 debt = 3_000 + (r % 3_000_000); // USD
            uint256 hfBps = 10_000 + ((r >> 64) % 3_000);
            // coll * price(1) * 0.92 / debt = hf  -> coll = debt * hf / 0.92
            uint256 coll = debt * hfBps / 9_200;
            out[k] = _pos(assetId & 0xff, coll * 1e6, debt * 1e6, 0, 9_200, 400);
        }
    }

    function _loadSynthetic(uint16 assetId, uint256 n, uint256 seed) internal {
        uint256 chunk = 1_000;
        vm.startPrank(owner);
        for (uint256 i; i < n; i += chunk) {
            uint256 m = n - i < chunk ? n - i : chunk;
            kaskad.loadPositions(assetId, _synthetic(assetId, i, m, seed));
        }
        vm.stopPrank();
    }

    function _sc(uint16 assetId, uint16 shock, uint16 steps, uint16 rounds, uint32 n)
        internal
        pure
        returns (Kaskad.Scenario memory)
    {
        return Kaskad.Scenario(assetId, shock, steps, rounds, n, 10_000);
    }

    function _scf(uint16 assetId, uint16 shock, uint16 steps, uint16 rounds, uint32 n, uint16 feedback)
        internal
        pure
        returns (Kaskad.Scenario memory)
    {
        return Kaskad.Scenario(assetId, shock, steps, rounds, n, feedback);
    }
}
