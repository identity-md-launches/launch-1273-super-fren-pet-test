// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {SFPTToken} from "../src/SFPTToken.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {TransientStateLibrary} from "v4-core/src/libraries/TransientStateLibrary.sol";
import {V4Router} from "./support/V4Router.sol";

/// @dev Only a test fixture for the external IMD pair; not an application contract.
contract PairFixture is ERC20 {
    constructor() ERC20("Test paired currency", "PAIR") {}

    function mint(address to, uint256 value) external {
        _mint(to, value);
    }
}

contract UniswapV4Test is Test {
    using StateLibrary for IPoolManager;
    using TransientStateLibrary for IPoolManager;

    address internal constant MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    address internal constant TREASURY = 0x900bCC8d58B67fF741c32D0Cd9a28aA1555c8068;
    address internal constant PAIR = address(bytes20(hex"d34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7"));
    uint160 internal constant TOKEN0_PRICE = 125270724187523965593206900;
    uint256 internal constant Q96 = 1 << 96;
    uint256 internal constant SUPPLY = 1e27;
    uint256 internal constant POOL_BUDGET = 9e26;

    SFPTToken internal token;
    IPoolManager internal manager;
    PairFixture internal pair;
    V4Router internal router;
    PoolKey internal key;
    address internal alice = makeAddr("v4 buyer");
    address internal distributor = makeAddr("test-only swarm distributor");
    int24 internal lower;
    int24 internal upper;
    uint128 internal liquidity;

    function setUp() public {
        vm.chainId(1);
        // Execute the actual constructor at the mandated address; its original-address
        // immutable must match for v4's NoDelegateCall check to succeed.
        vm.etch(MANAGER, abi.encodePacked(type(PoolManager).creationCode, abi.encode(address(this))));
        (bool ok, bytes memory runtime) = MANAGER.call("");
        require(ok && runtime.length != 0, "manager construction");
        vm.etch(MANAGER, runtime);
        manager = IPoolManager(MANAGER);
        vm.etch(PAIR, address(new PairFixture()).code);
        pair = PairFixture(PAIR);
        router = new V4Router(manager);
    }

    function _launch(bool tokenFirst) internal {
        // Exercise both deployed currency orderings without changing any token constant.
        for (uint256 i; i < 256; ++i) {
            token = new SFPTToken();
            if ((address(token) < PAIR) == tokenFirst) break;
        }
        assertEq(address(token) < PAIR, tokenFirst);
        assertEq(token.balanceOf(address(this)), SUPPLY);
        token.transfer(distributor, SUPPLY / 10);
        key = PoolKey({
            currency0: Currency.wrap(tokenFirst ? address(token) : PAIR),
            currency1: Currency.wrap(tokenFirst ? PAIR : address(token)),
            fee: 12500,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
        // sqrt(2500e18 / 1e27) * 2^96, reciprocated for the other currency order.
        uint160 price = tokenFirst ? TOKEN0_PRICE : uint160((uint256(1) << 192) / TOKEN0_PRICE);
        int24 tick = manager.initialize(key, price);
        (uint160 storedPrice,,, uint24 fee) = manager.getSlot0(key.toId());
        assertEq(storedPrice, price);
        assertEq(fee, 12500);

        int24 floorTick = (tick / 60) * 60;
        if (tick < 0 && tick % 60 != 0) floorTick -= 60;
        lower = tokenFirst ? floorTick + 60 : int24(-887220);
        upper = tokenFirst ? int24(887220) : floorTick;
        uint160 a = TickMath.getSqrtPriceAtTick(lower);
        uint160 b = TickMath.getSqrtPriceAtTick(upper);
        uint256 amount = tokenFirst
            ? FullMath.mulDiv(POOL_BUDGET, FullMath.mulDiv(a, b, Q96), uint256(b) - a)
            : FullMath.mulDiv(POOL_BUDGET, Q96, uint256(b) - a);
        require(amount <= type(uint128).max, "liquidity overflow");
        liquidity = uint128(amount);
        token.approve(address(router), POOL_BUDGET);
        router.modifyLiquidity(key, lower, upper, int256(uint256(liquidity)));
        uint256 seeded = token.balanceOf(MANAGER);
        assertGt(seeded, POOL_BUDGET - 1e9, "single-sided seed unexpectedly short");
        assertLe(seeded, POOL_BUDGET);
        assertEq(pair.balanceOf(MANAGER), 0, "seed must need only SFPT");
        assertEq(token.balanceOf(TREASURY), 0, "seed must not be taxed");
        assertEq(token.balanceOf(distributor), SUPPLY / 10);
        assertEq(token.balanceOf(address(this)) + seeded, POOL_BUDGET);
        pair.mint(alice, 100 ether);
        vm.startPrank(alice);
        pair.approve(address(router), type(uint256).max);
        token.approve(address(router), type(uint256).max);
        vm.stopPrank();
        _settled();
    }

    function _settled() internal view {
        assertEq(manager.getNonzeroDeltaCount(), 0);
        assertEq(manager.currencyDelta(address(router), key.currency0), 0);
        assertEq(manager.currencyDelta(address(router), key.currency1), 0);
        assertFalse(manager.isUnlocked());
        assertEq(token.totalSupply(), SUPPLY);
    }

    function _buy(bool tokenFirst, int256 specified, uint256 minNet) internal returns (uint256 gross) {
        uint256 poolBefore = token.balanceOf(MANAGER);
        uint256 treasuryBefore = token.balanceOf(TREASURY);
        uint256 buyerBefore = token.balanceOf(alice);
        vm.prank(alice);
        BalanceDelta delta = router.swap(key, !tokenFirst, specified, alice, minNet);
        int128 output = tokenFirst ? delta.amount0() : delta.amount1();
        assertGt(output, 0);
        gross = uint128(output);
        uint256 tax = gross * 2 / 100;
        assertEq(poolBefore - token.balanceOf(MANAGER), gross);
        assertEq(token.balanceOf(TREASURY) - treasuryBefore, tax);
        assertEq(token.balanceOf(alice) - buyerBefore, gross - tax);
        _settled();
    }

    function _roundtrip(bool tokenFirst, uint256 pairInput) internal {
        _launch(tokenFirst);
        _buy(tokenFirst, -int256(pairInput), 1);
        uint256 bought = token.balanceOf(alice);
        uint256 poolBefore = token.balanceOf(MANAGER);
        uint256 treasuryBefore = token.balanceOf(TREASURY);
        uint256 pairBefore = pair.balanceOf(alice);
        vm.prank(alice);
        router.swap(key, tokenFirst, -int256(bought), alice, 1);
        assertEq(token.balanceOf(alice), 0, "all net bought tokens are sellable");
        assertEq(token.balanceOf(MANAGER) - poolBefore, bought, "sell must settle whole");
        assertEq(token.balanceOf(TREASURY), treasuryBefore, "sell must not be taxed");
        assertGt(pair.balanceOf(alice), pairBefore);
        assertLt(pair.balanceOf(alice), 100 ether, "roundtrip must pay pool fee and creator tax");
        _settled();
    }

    function test_SeedBuySellWithSFPTAsCurrency0() public {
        _roundtrip(true, 0.01 ether);
    }

    function test_SeedBuySellWithSFPTAsCurrency1() public {
        _roundtrip(false, 0.01 ether);
    }

    function test_ExactOutputBuyQuotesGrossButPaysNet() public {
        _launch(true);
        uint256 gross = _buy(true, 1000 ether, 980 ether);
        assertEq(gross, 1000 ether);
        assertEq(token.balanceOf(alice), 980 ether);
    }

    function test_SlippageMustUseReceivedBalanceAndRevertsAtomically() public {
        _launch(false);
        uint256 poolBefore = token.balanceOf(MANAGER);
        vm.prank(alice);
        vm.expectRevert("minimum net output");
        router.swap(key, true, 1000 ether, alice, 1000 ether);
        assertEq(token.balanceOf(MANAGER), poolBefore);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(TREASURY), 0);
        assertEq(pair.balanceOf(alice), 100 ether);
        _settled();
    }

    function test_LiquidityWithdrawalAlsoFollowsSourceBasedTax() public {
        _launch(true);
        uint256 poolBefore = token.balanceOf(MANAGER);
        uint256 deployerBefore = token.balanceOf(address(this));
        router.modifyLiquidity(key, lower, upper, -int256(uint256(liquidity)));
        uint256 gross = poolBefore - token.balanceOf(MANAGER);
        assertGt(gross, 0);
        assertEq(token.balanceOf(TREASURY), gross * 2 / 100);
        assertEq(token.balanceOf(address(this)) - deployerBefore, gross - gross * 2 / 100);
        _settled();
    }

    /// forge-config: default.fuzz.runs = 1000
    function testFuzz_RealV4Roundtrip(bool tokenFirst, uint96 amount) public {
        _roundtrip(tokenFirst, bound(uint256(amount), 1e12, 10 ether));
    }
}
