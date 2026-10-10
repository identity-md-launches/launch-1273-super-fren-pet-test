// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {SFPTToken} from "../src/SFPTToken.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract SFPTTokenTest is Test {
    SFPTToken internal token;
    address internal constant MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    address internal constant TREASURY = 0x900bCC8d58B67fF741c32D0Cd9a28aA1555c8068;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal spender = makeAddr("spender");
    uint256 internal constant SUPPLY = 1e27;

    event Transfer(address indexed from, address indexed to, uint256 value);

    function setUp() public {
        token = new SFPTToken();
    }

    function test_WholeSupplyBelongsToDeployerAndDistributionIsExternal() public {
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(address(this)), SUPPLY);
        assertEq(token.balanceOf(address(token)), 0);
        assertEq(token.balanceOf(MANAGER), 0);
        assertEq(token.balanceOf(TREASURY), 0);
        assertEq(token.name(), "Super Fren Pet Test");
        assertEq(token.symbol(), "SFPT");
        assertEq(token.decimals(), 18);

        address distributor = makeAddr("test-only distributor");
        token.transfer(distributor, SUPPLY / 10);
        token.transfer(MANAGER, SUPPLY * 9 / 10);
        assertEq(token.balanceOf(distributor), SUPPLY / 10);
        assertEq(token.balanceOf(MANAGER), SUPPLY * 9 / 10);
        assertEq(token.balanceOf(address(this)), 0);
        vm.prank(distributor);
        token.transfer(alice, SUPPLY / 10);
        assertEq(token.balanceOf(alice), SUPPLY / 10);
        assertEq(token.balanceOf(TREASURY), 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_BuySplitsGrossDebitIntoTwoTransferEvents() public {
        token.transfer(MANAGER, 100 ether);
        vm.expectEmit(true, true, false, true, address(token));
        emit Transfer(MANAGER, TREASURY, 2 ether);
        vm.expectEmit(true, true, false, true, address(token));
        emit Transfer(MANAGER, alice, 98 ether);
        vm.prank(MANAGER);
        assertTrue(token.transfer(alice, 100 ether));
        assertEq(token.balanceOf(MANAGER), 0);
        assertEq(token.balanceOf(alice), 98 ether);
        assertEq(token.balanceOf(TREASURY), 2 ether);
    }

    function test_TransferFromUsesSourceAndSpendsGrossAllowance() public {
        token.transfer(MANAGER, 100 ether);
        vm.prank(MANAGER);
        token.approve(spender, 100 ether);
        vm.prank(spender);
        token.transferFrom(MANAGER, alice, 100 ether);
        assertEq(token.allowance(MANAGER, spender), 0);
        assertEq(token.balanceOf(alice), 98 ether);
        assertEq(token.balanceOf(TREASURY), 2 ether);
    }

    function test_ManagerAsSpenderDoesNotTaxWalletTransfer() public {
        token.transfer(alice, 100 ether);
        vm.prank(alice);
        token.approve(MANAGER, 100 ether);
        vm.prank(MANAGER);
        token.transferFrom(alice, bob, 100 ether);
        assertEq(token.balanceOf(bob), 100 ether);
        assertEq(token.balanceOf(TREASURY), 0);
    }

    function test_SellViaTransferFromSettlesFullGrossAmount() public {
        token.transfer(alice, 100 ether);
        vm.prank(alice);
        token.approve(spender, type(uint256).max);
        vm.prank(spender);
        token.transferFrom(alice, MANAGER, 100 ether);
        assertEq(token.balanceOf(MANAGER), 100 ether);
        assertEq(token.balanceOf(TREASURY), 0);
        assertEq(token.allowance(alice, spender), type(uint256).max);
    }

    function test_WalletAndTreasuryTransfersAreUntaxed() public {
        token.transfer(alice, 100 ether);
        vm.prank(alice);
        token.transfer(bob, 100 ether);
        vm.prank(bob);
        token.transfer(TREASURY, 100 ether);
        vm.prank(TREASURY);
        token.transfer(alice, 100 ether);
        assertEq(token.balanceOf(alice), 100 ether);
        assertEq(token.balanceOf(bob), 0);
        assertEq(token.balanceOf(TREASURY), 0);
    }

    function test_BuyWithTreasuryAsRecipientConservesFullAmount() public {
        token.transfer(MANAGER, 100 ether);
        vm.prank(MANAGER);
        token.transfer(TREASURY, 100 ether);
        assertEq(token.balanceOf(TREASURY), 100 ether);
        assertEq(token.balanceOf(MANAGER), 0);
    }

    function test_PoolSelfTransferIsIncomingAndAlwaysExempt() public {
        token.transfer(MANAGER, 100 ether);
        vm.prank(MANAGER);
        token.transfer(MANAGER, 100 ether);
        assertEq(token.balanceOf(MANAGER), 100 ether);
        assertEq(token.balanceOf(TREASURY), 0);
    }

    function test_WalletSelfTransferAndZeroBuyPreserveBalances() public {
        token.transfer(alice, 100 ether);
        vm.prank(alice);
        token.transfer(alice, 100 ether);
        vm.prank(MANAGER);
        token.transfer(alice, 0);
        assertEq(token.balanceOf(alice), 100 ether);
        assertEq(token.balanceOf(TREASURY), 0);
    }

    function test_RoundingAtSmallestTaxBoundary() public {
        token.transfer(MANAGER, 198);
        vm.startPrank(MANAGER);
        token.transfer(alice, 49);
        assertEq(token.balanceOf(TREASURY), 0);
        token.transfer(alice, 50);
        assertEq(token.balanceOf(TREASURY), 1);
        token.transfer(alice, 99);
        vm.stopPrank();
        assertEq(token.balanceOf(TREASURY), 2);
        assertEq(token.balanceOf(alice), 196);
        assertEq(token.balanceOf(MANAGER), 0);
    }

    function test_InsufficientGrossBalanceRollsBackTaxAndAllowance() public {
        token.transfer(MANAGER, 99 ether);
        vm.prank(MANAGER);
        token.approve(spender, 100 ether);
        vm.prank(spender);
        vm.expectPartialRevert(IERC20Errors.ERC20InsufficientBalance.selector);
        token.transferFrom(MANAGER, alice, 100 ether);
        assertEq(token.balanceOf(TREASURY), 0);
        assertEq(token.balanceOf(MANAGER), 99 ether);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.allowance(MANAGER, spender), 100 ether);
    }

    function test_NetOnlyAllowanceCannotPayGrossBuy() public {
        token.transfer(MANAGER, 100 ether);
        vm.prank(MANAGER);
        token.approve(spender, 98 ether);
        vm.prank(spender);
        vm.expectPartialRevert(IERC20Errors.ERC20InsufficientAllowance.selector);
        token.transferFrom(MANAGER, alice, 100 ether);
        assertEq(token.balanceOf(MANAGER), 100 ether);
        assertEq(token.balanceOf(TREASURY), 0);
    }

    function test_ZeroRecipientCannotBurnOrChargeTax() public {
        token.transfer(MANAGER, 100 ether);
        vm.prank(MANAGER);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        token.transfer(address(0), 100 ether);
        assertEq(token.balanceOf(MANAGER), 100 ether);
        assertEq(token.balanceOf(TREASURY), 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_DeployerHasNoAdministrativeEntryPoints() public {
        token.transfer(alice, 100 ether);
        string[16] memory signatures = [
            "owner()",
            "mint(address,uint256)",
            "burn(uint256)",
            "burnFrom(address,uint256)",
            "pause()",
            "blacklist(address)",
            "freeze(address)",
            "seize(address)",
            "setTaxRate(uint256)",
            "setTreasury(address)",
            "setPoolManager(address)",
            "transferOwnership(address)",
            "initialize(address)",
            "upgradeTo(address)",
            "setFeeExempt(address,bool)",
            "setMinter(address)"
        ];
        for (uint256 i; i < signatures.length; ++i) {
            (bool ok,) = address(token).call(abi.encodeWithSignature(signatures[i], alice, type(uint256).max));
            assertFalse(ok, signatures[i]);
        }
        vm.expectPartialRevert(IERC20Errors.ERC20InsufficientAllowance.selector);
        token.transferFrom(alice, address(this), 1);
        vm.prank(alice);
        token.transfer(bob, 100 ether);
        assertEq(token.balanceOf(bob), 100 ether);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.BUY_TAX_BPS(), 200);
        assertEq(token.TREASURY(), TREASURY);
        assertEq(token.POOL_MANAGER(), MANAGER);
    }

    function test_RuntimeContainsNoForbiddenOpcodes() public view {
        bytes memory runtime = address(token).code;
        for (uint256 i; i < runtime.length; ++i) {
            uint8 op = uint8(runtime[i]);
            if (op >= 0x60 && op <= 0x7f) {
                i += op - 0x5f;
                continue;
            }
            assertTrue(op != 0xf2 && op != 0xf4 && op != 0xff, "forbidden opcode");
        }
    }

    /// forge-config: default.fuzz.runs = 1000
    function testFuzz_BuyConservesSupplyAndTaxRoundsDown(uint256 amount) public {
        amount = bound(amount, 0, SUPPLY);
        token.transfer(MANAGER, amount);
        vm.prank(MANAGER);
        token.transfer(alice, amount);
        uint256 treasury = token.balanceOf(TREASURY);
        uint256 received = token.balanceOf(alice);
        assertEq(received + treasury, amount);
        assertEq(token.balanceOf(MANAGER), 0);
        assertLe(treasury * 100, amount * 2);
        assertLt(amount * 2 - treasury * 100, 100);
        assertEq(token.balanceOf(address(this)) + received + treasury, SUPPLY);
        assertEq(token.totalSupply(), SUPPLY);
    }

    /// forge-config: default.fuzz.runs = 1000
    function testFuzz_BuyWalletTransferSellRoundtrip(uint256 amount) public {
        amount = bound(amount, 0, SUPPLY);
        token.transfer(MANAGER, amount);
        vm.prank(MANAGER);
        token.transfer(alice, amount);
        uint256 bought = token.balanceOf(alice);
        vm.prank(alice);
        token.transfer(bob, bought);
        assertEq(token.balanceOf(bob), bought);
        vm.prank(bob);
        token.transfer(MANAGER, bought);
        assertEq(token.balanceOf(MANAGER) + token.balanceOf(TREASURY), amount);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(bob), 0);
        assertEq(token.totalSupply(), SUPPLY);
    }
}
