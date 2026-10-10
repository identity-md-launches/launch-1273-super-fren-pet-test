# Super Fren Pet Test (SFPT)

The five image-generated logo options are in [logos/](logos/README.md). The selected wallet icon is [artifacts/logo.png](artifacts/logo.png), an opaque 1024 × 1024 geometric green pet. Five drafts were generated and all five are retained; the logo README records the selection and small-size review.

[SFPTToken](src/SFPTToken.sol) is the only production contract. Its no-argument constructor mints exactly **1,000,000,000 SFPT with 18 decimals** (`1e27` minor units) to `msg.sender`. It inherits the vendored OpenZeppelin ERC-20 implementation and exposes no owner, administrator, mint, burn, pause, blacklist, upgrade or fee-setting entry point.

Every transfer **from** `0x000000000004444c5dc75cB358380D2e3dE08A90` to another address debits the gross amount from the PoolManager and splits it into `floor(amount / 50)` for the fixed treasury `0x900bCC8d58B67fF741c32D0Cd9a28aA1555c8068` and the remainder for the recipient. The same rule applies to `transferFrom`; allowances cover the gross amount. Tax rounds down in token minor units, so transfers below 50 minor units have zero tax. Incoming PoolManager transfers, including sells, seed deposits and PoolManager self-transfers, are exempt. Other wallet transfers are exempt. The treasury receives both portions when it is itself the recipient.

The token does not distinguish swaps from other PoolManager outflows. Consequently, liquidity withdrawals and any other outgoing PoolManager transfers also follow this rule. A router's quoted output is gross; recipient-balance checks and minimum-output settings must account for the tax. The tests exercise both successful net-output checks and atomic rejection of a minimum that exceeds the net receipt.

[launch.json](launch.json) supplies the exact requested launch parameters: IMD pairing, fee `12500` (1.25%), tick spacing `60`, provenance initial price `125270724187523965593206900`, and opening capitalization of `2500000000000000000000` paired-currency minor units. The factory derives the actual opening price using the deployed currency order. These are launch configuration values; the token does not deploy or configure pools.

The launch factory holds the entire supply initially. It sends 10% through its external Merkle distributor, budgets 90% for the single-sided pool seed, and forwards any seed rounding remainder to the specified `remainderTo`. The token makes no separate swarm allocation or distribution. No requester address or deployment key is needed by its constructor.

## Local verification

```sh
forge build
forge test
python3 tools/check_logos.py
```

Foundry is pinned to Solidity **0.8.26**, Cancun, optimizer enabled and `bytecode_hash = "none"`. All imported source dependencies and their licences are ordinary files under `lib/`; no submodules, external library paths, FFI or filesystem permissions are required. Dependency source commits are recorded in [lib/DEPENDENCIES.json](lib/DEPENDENCIES.json). The logo check uses the vendored PyPNG 0.20220715.0 module and the Python standard library.

**Validation result:** `forge build` and all **23 tests** passed. Three fuzz tests each ran 1,000 cases. Tests cover deployment/distribution, source-based tax, rounding boundaries, supply conservation, incoming settlement, wallet transfers, gross allowances, failure rollback, zero amounts, self-transfers, treasury recipients, missing admin selectors and forbidden runtime opcodes.

The integration suite constructs the vendored **real Uniswap v4 PoolManager implementation** locally at the mandated address and uses a test-only ERC-20 at the paired-currency address. It verifies fee 12500, tick spacing 60, single-sided seeding, buys and sells with both token orderings, exact-output buys, net slippage, liquidity removal, and zero outstanding currency deltas after each unlock. Test fixtures are under `test/` and are not launch contracts.

The suite runs offline. A fork against deployed Ethereum state and the launch factory's actual initialization hook was not run; that deployment-level check remains for launch validation. The provided protected test depends on the launch harness and its environment variables; its invariants informed these independent local tests, but its external harness was not available in this repository.
