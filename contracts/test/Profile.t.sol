// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console} from "forge-std/console.sol";
import {Base} from "./Base.t.sol";
import {Kaskad} from "../src/Kaskad.sol";

contract KaskadHarness is Kaskad {
    constructor(address o) Kaskad(o) {}

    function loadOnly(uint256 bookId, uint256 n) external view returns (uint256 gasUsed) {
        Result memory r;
        uint256 g = gasleft();
        _load(bookId, n, r);
        gasUsed = g - gasleft();
    }
}

/// forge test --match-contract Profile -vv
contract Profile is Base {
    KaskadHarness internal h;

    function setUp() public override {
        h = new KaskadHarness(owner);
        kaskad = h;
        vm.prank(owner);
        kaskad.setAsset(SYRUP, 1e18, 7_000_000e18 * 2_000 / 5_000);
        // calibrated-like: HF 1.001..1.05 (the real syrupUSDC book sits at ~1.02-1.03)
        vm.startPrank(owner);
        for (uint256 k; k < 2; ++k) {
            uint256[] memory part = new uint256[](1_000);
            for (uint256 j; j < 1_000; ++j) {
                uint256 r = uint256(keccak256(abi.encode(k, j)));
                uint256 debt = 3_000 + (r % 120_000);
                uint256 coll = debt * (10_010 + ((r >> 64) % 490)) / 9_200;
                part[j] = _pos(SYRUP, coll * 1e6, debt * 1e6, 0, 9_200, 400);
            }
            kaskad.loadPositions(SYRUP, part);
        }
        vm.stopPrank();
    }

    function test_profile() public view {
        uint256 lo = h.loadOnly(SYRUP, 2_000);
        Kaskad.Result memory rate = kaskad.preview(_scf(SYRUP, 300, 20, 3, 2_000, 0));
        Kaskad.Result memory mkt = kaskad.preview(_scf(SYRUP, 300, 20, 3, 2_000, 10_000));
        console.log("load+heapify (2000)", lo);
        console.log("rate oracle total", rate.gasUsed, rate.liquidations, rate.rounds);
        console.log("market oracle total", mkt.gasUsed, mkt.liquidations, mkt.rounds);
    }
}

contract ProfileTrace is Base {
    function test_trace() public {
        vm.prank(owner);
        kaskad.setAsset(SYRUP, 1e18, 1_000_000e18);
        vm.startPrank(owner);
        uint256[] memory part = new uint256[](40);
        for (uint256 j; j < 40; ++j) {
            uint256 r = uint256(keccak256(abi.encode(j)));
            uint256 debt = 3_000 + (r % 120_000);
            uint256 coll = debt * (10_010 + ((r >> 64) % 490)) / 9_200;
            part[j] = _pos(SYRUP, coll * 1e6, debt * 1e6, 0, 9_200, 400);
        }
        kaskad.loadPositions(SYRUP, part);
        vm.stopPrank();
        kaskad.preview(_scf(SYRUP, 300, 1, 2, 40, 10_000));
    }
}
