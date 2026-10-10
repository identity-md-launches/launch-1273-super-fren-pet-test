// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {SFPTToken} from "src/SFPTToken.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

/// @dev A closed set of holders with independent balance and allowance ledgers.
/// All SFPT comes from construction and ordinary transfers; no balance storage edits.
contract SFPTHandler is Test {
    uint256 internal constant SUPPLY = 1e27;
    address internal constant MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    address internal constant TREASURY = 0x900bCC8d58B67fF741c32D0Cd9a28aA1555c8068;

    SFPTToken public immutable token;
    address[6] public actors;
    mapping(address => uint256) public expectedBalance;
    mapping(address => mapping(address => uint256)) public expectedAllowance;

    constructor() {
        token = new SFPTToken();
        actors = [
            address(this),
            MANAGER,
            TREASURY,
            makeAddr("sequence alice"),
            makeAddr("sequence bob"),
            makeAddr("sequence distributor")
        ];
        expectedBalance[address(this)] = SUPPLY;

        _transfer(address(this), MANAGER, 9e26);
        _transfer(address(this), actors[5], 1e26);
        _transfer(actors[5], actors[3], 2e25);
        _transfer(actors[5], actors[4], 2e25);
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amountSeed) external {
        address from = _actor(fromSeed);
        _transfer(from, _actor(toSeed), _amount(amountSeed, expectedBalance[from]));
    }

    function approve(uint256 ownerSeed, uint256 spenderSeed, uint256 amount) external {
        _approve(_actor(ownerSeed), _actor(spenderSeed), amount);
    }

    /// @dev Uses approvals left by earlier calls, including overwritten or exhausted ones.
    function transferFrom(uint256 ownerSeed, uint256 spenderSeed, uint256 toSeed, uint256 amountSeed) external {
        address owner = _actor(ownerSeed);
        address spender = _actor(spenderSeed);
        uint256 limit = expectedBalance[owner];
        if (expectedAllowance[owner][spender] < limit) limit = expectedAllowance[owner][spender];
        _transferFrom(owner, spender, _actor(toSeed), _amount(amountSeed, limit));
    }

    /// @dev Guarantees nonzero delegated buys/sells remain reachable during random sequences.
    function approvedTransfer(uint256 ownerSeed, uint256 spenderSeed, uint256 toSeed, uint256 amountSeed, bool infinite)
        external
    {
        address owner = _actor(ownerSeed);
        address spender = _actor(spenderSeed);
        uint256 amount = _amount(amountSeed, expectedBalance[owner]);
        _approve(owner, spender, infinite ? type(uint256).max : amount);
        _transferFrom(owner, spender, _actor(toSeed), amount);
    }

    /// @dev Rejected operations must preserve both ledgers, including any attempted tax credit.
    function rejectedTransfer(uint256 ownerSeed, uint256 spenderSeed, uint256 amountSeed, uint8 failure) external {
        address owner = _actor(ownerSeed);
        address spender = _actor(spenderSeed);
        address recipient = actors[3];
        uint256 amount;
        bytes4 errorSelector;
        if (failure % 3 == 0) {
            amount = expectedBalance[owner] + bound(amountSeed, 1, SUPPLY);
            _approve(owner, spender, amount);
            errorSelector = IERC20Errors.ERC20InsufficientBalance.selector;
        } else if (failure % 3 == 1) {
            amount = bound(amountSeed, 1, SUPPLY);
            _approve(owner, spender, amount - 1);
            errorSelector = IERC20Errors.ERC20InsufficientAllowance.selector;
        } else {
            amount = _amount(amountSeed, expectedBalance[owner]);
            _approve(owner, spender, amount);
            recipient = address(0);
            errorSelector = IERC20Errors.ERC20InvalidReceiver.selector;
        }
        vm.prank(spender);
        vm.expectPartialRevert(errorSelector);
        token.transferFrom(owner, recipient, amount);
        // The invariant compares all balances and allowances with their pre-revert values.
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _amount(uint256 seed, uint256 limit) internal pure returns (uint256) {
        // Keep dust, exact tax boundaries and whole-balance transfers in the sequences.
        uint256 choice = seed % 6;
        if (choice == 0) return 0;
        if (choice == 1) return limit < 49 ? limit : 49;
        if (choice == 2) return limit < 50 ? limit : 50;
        if (choice == 3) return limit;
        return bound(seed, 0, limit);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        vm.prank(owner);
        assertTrue(token.approve(spender, amount));
        expectedAllowance[owner][spender] = amount;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        vm.prank(from);
        assertTrue(token.transfer(to, amount));
        _recordTransfer(from, to, amount);
    }

    function _transferFrom(address owner, address spender, address to, uint256 amount) internal {
        vm.prank(spender);
        assertTrue(token.transferFrom(owner, to, amount));
        if (expectedAllowance[owner][spender] != type(uint256).max) {
            expectedAllowance[owner][spender] -= amount;
        }
        _recordTransfer(owner, to, amount);
    }

    function _recordTransfer(address from, address to, uint256 amount) internal {
        uint256 tax = from == MANAGER && to != MANAGER ? amount * 2 / 100 : 0;
        expectedBalance[from] -= amount;
        expectedBalance[to] += amount - tax;
        expectedBalance[TREASURY] += tax;
    }
}
