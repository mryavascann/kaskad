// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {RiskOracle} from "../src/RiskOracle.sol";
import {GuardV2} from "../src/GuardV2.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {RiskVault} from "../src/RiskVault.sol";
import {DeployRisk} from "./DeployRisk.s.sol";

/// The A6 demo on testnet: RiskOracle publishes from the live books, GuardV2 pauses the flagged market,
/// RiskVault moves its deposits out of it.
///   forge script script/DemoRisk.s.sol --rpc-url monad_testnet --broadcast --slow
contract DemoRisk is Script {
    function run() external virtual {
        string memory json = vm.readFile("./deployments/risk-testnet.json");
        demo(
            vm.envUint("DEPLOYER_PRIVATE_KEY"),
            RiskOracle(vm.parseJsonAddress(json, ".riskOracle")),
            GuardV2(vm.parseJsonAddress(json, ".guardV2")),
            MockUSD(vm.parseJsonAddress(json, ".kUSD")),
            RiskVault(vm.parseJsonAddress(json, ".riskVault"))
        );
    }

    function demo(uint256 pk, RiskOracle oracle, GuardV2 guard, MockUSD usd, RiskVault vault) internal {
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);
        uint256 g = gasleft();
        (bool syrupRisk, uint16 syrupLtv) = oracle.publish(9);
        console.log("gas publish(syrupUSDC)", g - gasleft());
        g = gasleft();
        (bool wethRisk, uint16 wethLtv) = oracle.publish(5);
        console.log("gas publish(WETH)     ", g - gasleft());
        g = gasleft();
        (uint256 tripped,) = guard.refresh();
        console.log("gas guard.refresh     ", g - gasleft());
        if (vault.totalAssets() == 0) {
            usd.approve(address(vault), 1_000_000e6);
            vault.deposit(1_000_000e6, deployer);
        }
        g = gasleft();
        vault.rebalance();
        console.log("gas vault.rebalance   ", g - gasleft());
        vm.stopBroadcast();

        console.log("syrupUSDC at risk", syrupRisk, "LTV bps", syrupLtv);
        console.log("WETH      at risk", wethRisk, "LTV bps", wethLtv);
        console.log("markets paused", tripped);
        for (uint16 shock = 0; shock < 4; ++shock) {
            RiskOracle.Report memory r = oracle.latest(9, oracle.shocks()[shock]);
            console.log("syrupUSDC shock bps", oracle.shocks()[shock]);
            console.log("  bad / stuck / hidden ($)", r.badDebt / 1e18, r.stuckDebt / 1e18, r.hiddenBadDebt / 1e18);
        }
    }
}

/// Dry run of deploy + demo in one simulation (no --broadcast): gas of every transaction.
contract ProbeRisk is DeployRisk, DemoRisk {
    function run() external override(DeployRisk, DemoRisk) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        (RiskOracle oracle, GuardV2 guard, MockUSD usd, RiskVault vault) = deploy(pk);
        demo(pk, oracle, guard, usd, vault);
    }
}
