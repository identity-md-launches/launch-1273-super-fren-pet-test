# SFPT test coverage

Run `forge build` and `forge test` from the repository root. The suite uses only
committed dependencies, needs no RPC or environment variables, and keeps Foundry's
default 256 fuzz runs. No production contracts or configuration were changed.

| Suite | Properties checked |
| --- | --- |
| `SFPTToken.t.sol` | One constructor mint of 1e27 units to the actual deployer; metadata; external 10% distributor allocation and claims; full 90% pool deposit; 2% source-based tax and events; untaxed sells and wallet transfers; rounding, zero, maximum amounts, self-transfers, treasury recipients and rejecting treasury code. |
| `SFPTToken.t.sol` failure paths | Insufficient gross balance or allowance, partial-tax rollback, zero recipients, spent/revoked approvals, finite and unlimited allowances, correctly encoded administrative calls from deployer, stranger, PoolManager and treasury, and prohibited runtime opcodes. |
| `UniswapV4.t.sol` | Real vendored PoolManager constructed locally at the required address; paired-currency fixture at the supplied address; both currency orderings; fee 12500, tick spacing 60, opening price and single-sided seeding; factory forwarding of seed dust to the specified remainder address; buys, sells, exact-output gross/net accounting, liquidity withdrawals, and fee collection without double claims. |
| `UniswapV4.t.sol` failure paths | Rejected input payments and net minimum output one minor unit above receipt; rollback of price, active liquidity, fee growth, balances, allowances and creator tax; successful retry and no unsettled currency deltas. |
| `SFPTInvariant.t.sol` | Independent ledgers for every tracked holder and allowance; fixed supply and constants; gross allowance spending; exact tax credits; conservation and atomic failure across random call sequences. |

The stateful handler starts with factory-style distribution and then mixes direct
transfers, approval changes, delegated transfers, finite/infinite approvals and
deliberately rejected calls. Its six holders include the deployer, PoolManager,
treasury, distributor and two traders. Zero amounts, 49/50-unit tax boundaries,
full balances and aliased recipients are reachable. It never writes token storage
or manufactures SFPT. The campaign runs 64 sequences of 32 calls, with unexpected
reverts treated as failures; only handler action selectors are targeted.

The token does not implement the factory, Merkle distributor or pool settings.
These tests model external distribution and exercise the requested pool settings;
they do not claim to test Merkle proofs or enforce `launch.json` from token code.
Local integration uses real v4 core and a plain ERC-20 paired-currency fixture,
without the production factory's initialization hook. A live Ethereum fork with
the deployed pair, production launch factory/hook and chosen trading router remains
outside this offline suite. No live fork is silently skipped or required to pass.
