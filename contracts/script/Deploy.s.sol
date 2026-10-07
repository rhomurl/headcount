// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {MockUSDC} from "../src/MockUSDC.sol";
import {HeadcountEscrow} from "../src/HeadcountEscrow.sol";

interface DeployVm {
    function envUint(string calldata) external returns (uint256);
    function addr(uint256) external returns (address);
    function startBroadcast(uint256) external;
    function stopBroadcast() external;
}

contract Deploy {
    DeployVm private constant vm = DeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    event log_named_address(string key, address value);

    function run() external returns (MockUSDC token, HeadcountEscrow escrow) {
        require(block.chainid == 84532, "Expected Base Sepolia");
        uint256 privateKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        vm.startBroadcast(privateKey);
        token = new MockUSDC(deployer);
        escrow = new HeadcountEscrow(token, deployer);
        token.mint(deployer, 1_000_000e6);
        token.approve(address(escrow), type(uint256).max);
        vm.stopBroadcast();
        emit log_named_address("TOKEN_ADDRESS", address(token));
        emit log_named_address("ESCROW_ADDRESS", address(escrow));
    }
}
