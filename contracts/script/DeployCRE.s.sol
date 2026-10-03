// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {KaskadCREReceiver} from "../src/KaskadCREReceiver.sol";
import {RiskOracle} from "../src/RiskOracle.sol";
import {GuardV2} from "../src/GuardV2.sol";
import {RiskVault} from "../src/RiskVault.sol";

/// A7: the receiver of the Kaskad CRE workflow (cre/kaskad-risk), wired to the A6 contracts.
///   dry run: forge script script/DeployCRE.s.sol --rpc-url monad_testnet
///   deploy:  WRITE_DEPLOYMENT=true forge script script/DeployCRE.s.sol --rpc-url monad_testnet --broadcast --slow
/// The forwarder is CRE's MockKeystoneForwarder on Monad testnet (what `cre workflow simulate
/// --broadcast` sends through); setForwarder() switches to the KeystoneForwarder for a deployed workflow.
contract DeployCRE is Script {
    address constant MOCK_FORWARDER = 0xB9F79d863261869B234c481D1f9A7af84AeAd192;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        require(block.chainid == 10143, "testnet only");
        string memory risk = vm.readFile("./deployments/risk-testnet.json");

        vm.startBroadcast(pk);
        KaskadCREReceiver receiver = new KaskadCREReceiver(
            deployer,
            MOCK_FORWARDER,
            RiskOracle(vm.parseJsonAddress(risk, ".riskOracle")),
            GuardV2(vm.parseJsonAddress(risk, ".guardV2")),
            RiskVault(vm.parseJsonAddress(risk, ".riskVault"))
        );
        vm.stopBroadcast();

        string memory o = "cre";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "block", block.number);
        vm.serializeAddress(o, "forwarder", MOCK_FORWARDER);
        string memory json = vm.serializeAddress(o, "receiver", address(receiver));
        if (vm.envOr("WRITE_DEPLOYMENT", false)) vm.writeJson(json, "./deployments/cre-testnet.json");
        console.log("KaskadCREReceiver", address(receiver));
    }
}
