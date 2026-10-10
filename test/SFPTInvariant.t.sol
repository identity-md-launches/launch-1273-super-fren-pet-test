// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {SFPTToken} from "src/SFPTToken.sol";
import {SFPTHandler} from "./support/SFPTHandler.sol";

/// @dev Short campaigns; unexpected handler reverts fail instead of silently losing coverage.
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 32
/// forge-config: default.invariant.fail-on-revert = true
contract SFPTInvariantTest is Test {
    SFPTHandler internal handler;
    SFPTToken internal token;

    function setUp() public {
        handler = new SFPTHandler();
        token = handler.token();
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = SFPTHandler.transfer.selector;
        selectors[1] = SFPTHandler.approve.selector;
        selectors[2] = SFPTHandler.transferFrom.selector;
        selectors[3] = SFPTHandler.approvedTransfer.selector;
        selectors[4] = SFPTHandler.rejectedTransfer.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
    }

    function invariant_FixedSupplyAndEveryBalanceMatchTheLedger() public view {
        uint256 sum;
        for (uint256 i; i < 6; ++i) {
            address actor = handler.actors(i);
            uint256 balance = token.balanceOf(actor);
            assertEq(balance, handler.expectedBalance(actor), "unexpected credit, debit or tax");
            sum += balance;
        }
        assertEq(sum, 1e27, "supply escaped the closed holder set");
        assertEq(token.totalSupply(), 1e27);
        assertEq(token.balanceOf(address(0)), 0);
        assertEq(token.balanceOf(address(token)), 0);
    }

    function invariant_AllowancesFollowGrossSpendingAndRevertsAreAtomic() public view {
        for (uint256 i; i < 6; ++i) {
            for (uint256 j; j < 6; ++j) {
                address owner = handler.actors(i);
                address spender = handler.actors(j);
                assertEq(token.allowance(owner, spender), handler.expectedAllowance(owner, spender));
            }
        }
    }

    function invariant_LaunchParametersNeverChange() public view {
        assertEq(token.INITIAL_SUPPLY(), 1e27);
        assertEq(token.BUY_TAX_BPS(), 200);
        assertEq(token.BPS_DENOMINATOR(), 10_000);
        assertEq(token.POOL_MANAGER(), 0x000000000004444c5dc75cB358380D2e3dE08A90);
        assertEq(token.TREASURY(), 0x900bCC8d58B67fF741c32D0Cd9a28aA1555c8068);
        assertEq(token.name(), "Super Fren Pet Test");
        assertEq(token.symbol(), "SFPT");
        assertEq(token.decimals(), 18);
    }
}
