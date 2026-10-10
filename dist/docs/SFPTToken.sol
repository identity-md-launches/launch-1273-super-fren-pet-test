// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply Super Fren Pet Test with a permanent 2% PoolManager-outgoing tax.
/// @dev The launch factory receives the entire supply and handles distribution externally.
contract SFPTToken is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant BUY_TAX_BPS = 200;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    address public constant POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    address public constant TREASURY = 0x900bCC8d58B67fF741c32D0Cd9a28aA1555c8068;

    constructor() ERC20("Super Fren Pet Test", "SFPT") {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /// @dev Applies to both transfer and transferFrom based on the source, never the caller.
    ///      Incoming PoolManager transfers always settle in full, including self-transfers.
    function _update(address from, address to, uint256 value) internal override {
        if (from == POOL_MANAGER && to != POOL_MANAGER) {
            // Exactly floor(value * 2 / 100), without a potentially overflowing multiplication.
            uint256 tax = value / (BPS_DENOMINATOR / BUY_TAX_BPS);
            if (tax != 0) super._update(from, TREASURY, tax);
            super._update(from, to, value - tax);
        } else {
            super._update(from, to, value);
        }
    }
}
