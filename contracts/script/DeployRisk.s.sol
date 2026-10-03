// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Kaskad} from "../src/Kaskad.sol";
import {KaskadMC} from "../src/KaskadMC.sol";
import {KaskadMCv3} from "../src/KaskadMCv3.sol";
import {RiskOracle} from "../src/RiskOracle.sol";
import {GuardV2} from "../src/GuardV2.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {MockMarketV2} from "../src/MockMarketV2.sol";
import {RiskVault} from "../src/RiskVault.sol";

/// A6: RiskOracle + GuardV2 + RiskVault on top of the books already on testnet.
///   dry run: forge script script/DeployRisk.s.sol --rpc-url monad_testnet
///   deploy:  forge script script/DeployRisk.s.sol --rpc-url monad_testnet --broadcast --slow
/// KaskadMCv3 reads the existing Kaskad's books (`source`) and copies the arbitrage recovery of the
/// existing KaskadMC, so its cascades are the ones the site shows. Rules use the site's base settings
/// (20 steps, 3 rounds, external oracle) and trigger on the -10% shock.
contract DeployRisk is Script {
    Kaskad constant KASKAD = Kaskad(0xdC2D3A2F4cffBf6a0d7945f6505399e2e474b661);
    KaskadMC constant MC = KaskadMC(0x94f27456bBAfe2a8A69ADE8D4C98eB958abB1E6d);
    uint16 constant MAX_ASSET_ID = 15;
    uint16 constant SYRUP_USDC = 9;
    uint16 constant WETH = 5;

    function rule() internal pure returns (RiskOracle.Rule memory) {
        return RiskOracle.Rule({
            enabled: true,
            steps: 20,
            rounds: 3,
            maxPositions: 0, // the whole book
            oracleFeedbackBps: 0,
            triggerShockBps: 1_000,
            lossThresholdBps: 100, // bad + hidden bad debt above 1% of the debt
            stuckThresholdBps: 2_000, // or more than 20% of the debt left unliquidated
            ltvFloorBps: 7_000,
            ltvCeilingBps: 9_000,
            ltvStepBps: 500,
            minInterval: 10 minutes
        });
    }

    function run() external virtual {
        deploy(vm.envUint("DEPLOYER_PRIVATE_KEY"));
    }

    function deploy(uint256 pk) internal returns (RiskOracle oracle, GuardV2 guard, MockUSD usd, RiskVault vault) {
        address deployer = vm.addr(pk);
        require(block.chainid == 10143, "testnet only");

        vm.startBroadcast(pk);
        KaskadMCv3 v3 = new KaskadMCv3(deployer, KASKAD);
        for (uint16 id; id <= MAX_ASSET_ID; ++id) {
            uint16 bps = MC.recoveryBps(id);
            if (bps != 0) v3.setRecovery(id, bps);
        }
        oracle = new RiskOracle(deployer, v3);
        oracle.setRule(SYRUP_USDC, rule());
        oracle.setRule(WETH, rule());

        guard = new GuardV2(deployer, oracle, 1 days, 30 minutes);
        usd = new MockUSD(deployer);
        MockMarketV2 syrupMarket = new MockMarketV2(deployer, usd, SYRUP_USDC, "kUSD / syrupUSDC", 9_000);
        MockMarketV2 wethMarket = new MockMarketV2(deployer, usd, WETH, "kUSD / WETH", 9_000);
        syrupMarket.setGuard(address(guard));
        wethMarket.setGuard(address(guard));
        guard.addMarket(syrupMarket);
        guard.addMarket(wethMarket);

        vault = new RiskVault(deployer, usd, oracle, 1 days);
        vault.addMarket(syrupMarket);
        vault.addMarket(wethMarket);
        usd.mint(deployer, 10_000_000e6);
        vm.stopBroadcast();

        string memory o = "risk";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "block", block.number);
        vm.serializeAddress(o, "kaskadMCv3", address(v3));
        vm.serializeAddress(o, "riskOracle", address(oracle));
        vm.serializeAddress(o, "guardV2", address(guard));
        vm.serializeAddress(o, "kUSD", address(usd));
        vm.serializeAddress(o, "marketSyrupUSDC", address(syrupMarket));
        vm.serializeAddress(o, "marketWETH", address(wethMarket));
        string memory json = vm.serializeAddress(o, "riskVault", address(vault));
        if (vm.envOr("WRITE_DEPLOYMENT", false)) vm.writeJson(json, "./deployments/risk-testnet.json");

        console.log("KaskadMCv3 ", address(v3));
        console.log("RiskOracle ", address(oracle));
        console.log("GuardV2    ", address(guard));
        console.log("kUSD       ", address(usd));
        console.log("Market syrup", address(syrupMarket));
        console.log("Market WETH ", address(wethMarket));
        console.log("RiskVault  ", address(vault));
    }
}
