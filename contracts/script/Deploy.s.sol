// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Kaskad} from "../src/Kaskad.sol";
import {Guard} from "../src/Guard.sol";
import {MockMarket} from "../src/MockMarket.sol";

/// forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --slow
/// Positions, asset prices and the Guard scenario are configured afterwards by scripts/ (TypeScript).
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        require(block.chainid == 10143, "testnet only");

        vm.startBroadcast(pk);
        Kaskad kaskad = new Kaskad(deployer);
        MockMarket marketA = new MockMarket(deployer, "Piyasa A (korumasiz)", 9000);
        MockMarket marketB = new MockMarket(deployer, "Piyasa B (Guard'li)", 9000);
        Guard guard = new Guard(deployer, kaskad, marketB);
        marketB.setGuard(address(guard));
        vm.stopBroadcast();

        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "block", block.number);
        vm.serializeAddress(o, "kaskad", address(kaskad));
        vm.serializeAddress(o, "marketA", address(marketA));
        vm.serializeAddress(o, "marketB", address(marketB));
        string memory json = vm.serializeAddress(o, "guard", address(guard));
        vm.writeJson(json, "./deployments/testnet.json");

        console.log("Kaskad ", address(kaskad));
        console.log("MarketA", address(marketA));
        console.log("MarketB", address(marketB));
        console.log("Guard  ", address(guard));
    }
}
