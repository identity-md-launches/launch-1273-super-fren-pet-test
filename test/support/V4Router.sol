// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Test-only router exercising real unlock/sync/settle/take, including net-output slippage.
contract V4Router is IUnlockCallback {
    IPoolManager public immutable manager;

    struct Operation {
        PoolKey key;
        address payer;
        address recipient;
        bool liquidity;
        ModifyLiquidityParams modify;
        SwapParams swap;
    }

    constructor(IPoolManager manager_) {
        manager = manager_;
    }

    function modifyLiquidity(PoolKey memory key, int24 lower, int24 upper, int256 liquidity)
        external
        returns (BalanceDelta)
    {
        Operation memory op;
        op.key = key;
        op.payer = msg.sender;
        op.recipient = msg.sender;
        op.liquidity = true;
        op.modify = ModifyLiquidityParams(lower, upper, liquidity, bytes32(uint256(uint160(msg.sender))));
        return abi.decode(manager.unlock(abi.encode(op)), (BalanceDelta));
    }

    function swap(PoolKey memory key, bool zeroForOne, int256 amount, address recipient, uint256 minNetOutput)
        external
        returns (BalanceDelta delta)
    {
        Operation memory op;
        op.key = key;
        op.payer = msg.sender;
        op.recipient = recipient;
        op.swap = SwapParams(zeroForOne, amount, zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1);
        IERC20 output = IERC20(Currency.unwrap(zeroForOne ? key.currency1 : key.currency0));
        uint256 before = output.balanceOf(recipient);
        delta = abi.decode(manager.unlock(abi.encode(op)), (BalanceDelta));
        require(output.balanceOf(recipient) - before >= minNetOutput, "minimum net output");
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager), "only manager");
        Operation memory op = abi.decode(data, (Operation));
        BalanceDelta delta;
        if (op.liquidity) {
            (delta,) = manager.modifyLiquidity(op.key, op.modify, "");
        } else {
            delta = manager.swap(op.key, op.swap, "");
        }
        _settle(op.key.currency0, delta.amount0(), op.payer, op.recipient);
        _settle(op.key.currency1, delta.amount1(), op.payer, op.recipient);
        return abi.encode(delta);
    }

    function _settle(Currency currency, int128 delta, address payer, address recipient) private {
        if (delta < 0) {
            uint256 debt = uint256(-int256(delta));
            manager.sync(currency);
            require(IERC20(Currency.unwrap(currency)).transferFrom(payer, address(manager), debt), "payment failed");
            require(manager.settle() == debt, "settlement shortfall");
        } else if (delta > 0) {
            manager.take(currency, recipient, uint128(delta));
        }
    }
}
