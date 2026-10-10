// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {SFPTToken} from "../src/SFPTToken.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

/// @dev Test-only recipient proving tax collection needs no treasury callback.
contract RejectingTreasury {
    fallback() external {
        revert("no treasury callbacks");
    }
}

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

    function test_ConstructorEmitsOnlyOneMintToItsActualDeployer() public {
        vm.recordLogs();
        vm.prank(alice);
        SFPTToken fresh = new SFPTToken();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1, "constructor must not distribute or mint other allocations");
        assertEq(logs[0].emitter, address(fresh));
        assertEq(logs[0].topics.length, 3);
        assertEq(logs[0].topics[0], keccak256("Transfer(address,address,uint256)"));
        assertEq(logs[0].topics[1], bytes32(0));
        assertEq(logs[0].topics[2], bytes32(uint256(uint160(alice))));
        assertEq(abi.decode(logs[0].data, (uint256)), SUPPLY);
        assertEq(fresh.balanceOf(alice), SUPPLY);
        assertEq(fresh.balanceOf(address(this)), 0);
        assertEq(fresh.totalSupply(), SUPPLY);
    }

    function test_SpentBuyAllowanceCannotBeReplayedAndRevocationTakesEffect() public {
        token.transfer(MANAGER, 300 ether);
        vm.prank(MANAGER);
        token.approve(spender, 100 ether);
        vm.prank(spender);
        assertTrue(token.transferFrom(MANAGER, alice, 100 ether));
        vm.prank(spender);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, 0, 100 ether));
        token.transferFrom(MANAGER, alice, 100 ether);

        vm.startPrank(MANAGER);
        token.approve(spender, type(uint256).max);
        token.approve(spender, 0);
        vm.stopPrank();
        vm.prank(spender);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, 0, 100 ether));
        token.transferFrom(MANAGER, alice, 100 ether);
        assertEq(token.balanceOf(MANAGER), 200 ether);
        assertEq(token.balanceOf(alice), 98 ether);
        assertEq(token.balanceOf(TREASURY), 2 ether);
        assertEq(token.allowance(MANAGER, spender), 0);
    }

    function testFuzz_FailedBuyCannotLeavePartialTaxCredit(uint256 gross, bool delegated) public {
        gross = bound(gross, 50, SUPPLY);
        token.transfer(MANAGER, gross - 1);
        if (delegated) {
            vm.prank(MANAGER);
            token.approve(spender, gross);
        }
        vm.prank(delegated ? spender : MANAGER);
        vm.expectPartialRevert(IERC20Errors.ERC20InsufficientBalance.selector);
        if (delegated) token.transferFrom(MANAGER, alice, gross);
        else token.transfer(alice, gross);

        assertEq(token.balanceOf(MANAGER), gross - 1);
        assertEq(token.balanceOf(TREASURY), 0, "tax credit must roll back with the net transfer");
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(address(this)), SUPPLY - gross + 1);
        assertEq(token.allowance(MANAGER, spender), delegated ? gross : 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function testFuzz_ZeroBuyRecipientCannotSpendAllowanceOrBurn(uint256 gross, bool infinite) public {
        gross = bound(gross, 0, SUPPLY);
        token.transfer(MANAGER, gross);
        uint256 approved = infinite ? type(uint256).max : gross;
        vm.prank(MANAGER);
        token.approve(spender, approved);
        vm.prank(spender);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        token.transferFrom(MANAGER, address(0), gross);
        assertEq(token.allowance(MANAGER, spender), approved);
        assertEq(token.balanceOf(MANAGER), gross);
        assertEq(token.balanceOf(TREASURY), 0);
        assertEq(token.balanceOf(address(0)), 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function testFuzz_DelegatedBuyHandlesAliasedRecipients(uint256 gross, uint256 extra, uint8 destination) public {
        gross = bound(gross, 0, SUPPLY);
        extra = bound(extra, 0, SUPPLY);
        address recipient = destination % 3 == 0 ? alice : destination % 3 == 1 ? TREASURY : MANAGER;
        token.transfer(MANAGER, gross);
        vm.prank(MANAGER);
        token.approve(spender, gross + extra);
        vm.prank(spender);
        assertTrue(token.transferFrom(MANAGER, recipient, gross));
        assertEq(token.allowance(MANAGER, spender), extra, "allowance always covers gross, even self-transfers");
        uint256 tax = gross * 2 / 100;
        assertEq(token.balanceOf(alice), recipient == alice ? gross - tax : 0);
        assertEq(token.balanceOf(TREASURY), recipient == alice ? tax : recipient == TREASURY ? gross : 0);
        assertEq(token.balanceOf(MANAGER), recipient == MANAGER ? gross : 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_NoLaunchRoleHasAdministrativePowers() public {
        address[4] memory callers = [address(this), alice, MANAGER, TREASURY];
        // Correct ABI types matter: malformed calldata could hide an existing setter.
        bytes[] memory calls = new bytes[](18);
        calls[0] = abi.encodeWithSignature("owner()");
        calls[1] = abi.encodeWithSignature("mint(address,uint256)", bob, SUPPLY);
        calls[2] = abi.encodeWithSignature("burn(uint256)", 1);
        calls[3] = abi.encodeWithSignature("burnFrom(address,uint256)", bob, 1);
        calls[4] = abi.encodeWithSignature("pause()");
        calls[5] = abi.encodeWithSignature("setBlacklist(address,bool)", bob, true);
        calls[6] = abi.encodeWithSignature("setTaxRate(uint256)", 0);
        calls[7] = abi.encodeWithSignature("setBuyTaxBps(uint256)", 0);
        calls[8] = abi.encodeWithSignature("setTreasury(address)", bob);
        calls[9] = abi.encodeWithSignature("setPoolManager(address)", bob);
        calls[10] = abi.encodeWithSignature("setFeeExempt(address,bool)", bob, true);
        calls[11] = abi.encodeWithSignature("transferOwnership(address)", bob);
        calls[12] = abi.encodeWithSignature("initialize(address)", bob);
        calls[13] = abi.encodeWithSignature("upgradeTo(address)", bob);
        calls[14] = abi.encodeWithSignature("grantRole(bytes32,address)", bytes32(0), bob);
        calls[15] = abi.encodeWithSignature("seize(address)", bob);
        calls[16] = abi.encodeWithSignature("freeze(address)", bob);
        calls[17] = abi.encodeWithSignature("setMinter(address)", bob);
        token.transfer(bob, 100 ether);
        for (uint256 i; i < callers.length; ++i) {
            for (uint256 j; j < calls.length; ++j) {
                vm.prank(callers[i]);
                (bool ok,) = address(token).call(calls[j]);
                assertFalse(ok, "unexpected administrative entry point");
            }
        }
        assertEq(token.balanceOf(bob), 100 ether);
        vm.prank(bob);
        token.transfer(MANAGER, 100 ether);
        vm.prank(MANAGER);
        token.transfer(bob, 100 ether);
        assertEq(token.balanceOf(bob), 98 ether, "holder remains transferable and tax stays fixed");
        assertEq(token.balanceOf(TREASURY), 2 ether);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.TREASURY(), TREASURY);
        assertEq(token.POOL_MANAGER(), MANAGER);
        assertEq(token.BUY_TAX_BPS(), 200);
        assertEq(token.BPS_DENOMINATOR(), 10_000);
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

    function test_BuySucceedsWhenTreasuryRejectsCalls() public {
        vm.etch(TREASURY, address(new RejectingTreasury()).code);
        (bool acceptsCall,) = TREASURY.call("");
        assertFalse(acceptsCall, "treasury fixture must reject calls");

        token.transfer(MANAGER, 100 ether);
        vm.prank(MANAGER);
        assertTrue(token.transfer(alice, 100 ether));

        assertEq(token.balanceOf(MANAGER), 0);
        assertEq(token.balanceOf(alice), 98 ether);
        assertEq(token.balanceOf(TREASURY), 2 ether);
        assertEq(token.totalSupply(), SUPPLY);
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

    function test_MaximumBuyRevertsWithoutArithmeticOverflowOrBalanceChanges() public {
        token.transfer(MANAGER, 100 ether);
        vm.prank(MANAGER);
        token.approve(spender, type(uint256).max);

        vm.prank(spender);
        vm.expectPartialRevert(IERC20Errors.ERC20InsufficientBalance.selector);
        token.transferFrom(MANAGER, alice, type(uint256).max);

        assertEq(token.balanceOf(MANAGER), 100 ether);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(TREASURY), 0);
        assertEq(token.balanceOf(address(this)), SUPPLY - 100 ether);
        assertEq(token.allowance(MANAGER, spender), type(uint256).max);
        assertEq(token.totalSupply(), SUPPLY);
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
