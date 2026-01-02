// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        // Mint 1 million tokens to the deployer immediately
        // 18 decimals is the standard for most tokens (like ETH, DAI, UNI)
        _mint(msg.sender, 1000000 * 10**18); 
    }
    
    /// @notice Helper to mint more tokens during tests if we run out
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}