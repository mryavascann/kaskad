// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console} from "forge-std/console.sol";
import {Base} from "./Base.t.sol";
import {Kaskad} from "../src/Kaskad.sol";

/// @notice Resolution benchmark under Foundry's Ethereum gas schedule (cold SLOAD 2,100,
/// quadratic memory). The same scenarios are measured on Monad testnet via `preview`.
/// Run: forge test --match-contract GasBench -vv
contract GasBench is Base {
    uint32[5] internal levels = [uint32(500), 2_000, 5_000, 10_000, 20_000];

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        kaskad.setAsset(SYRUP, 1e18, 50_000_000e18);
        _loadSynthetic(SYRUP, 20_000, 77);
    }

    function test_benchResolution() public {
        for (uint256 i; i < levels.length; ++i) {
            Kaskad.Scenario memory s = _sc(SYRUP, 300, 20, 10, levels[i]);
            uint256 g0 = gasleft();
            vm.prank(alice);
            (, Kaskad.Result memory r) = kaskad.simulate(s);
            uint256 txGas = g0 - gasleft();
            console.log("positions", levels[i]);
            console.log("  eth engine gas", r.gasUsed);
            console.log("  eth simulate call gas", txGas);
            console.log("  memory bytes", r.memoryBytes);
            console.log("  rounds / liquidations", r.rounds, r.liquidations);
        }
    }
}
