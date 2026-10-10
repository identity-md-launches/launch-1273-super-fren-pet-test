# Super Fren Pet Test (SFPT)

## Website

The static site is in [site/](site/index.html); the ready-to-publish export is [dist/](dist/index.html). It includes the real-time Three.js pet den, live launch telemetry, exact 2% buy-tax calculator, transfer diagram, educational buying guide, documentation, FAQ, sharing and a custom 404. The creator's “Do not buy, this is a test” notice is prominent. Bridge and pet-staking scenery is explicitly a concept, not claimed contract functionality.

**No frontend installation or compilation is needed to run the site.** HTML, CSS, JavaScript, the supplied logo, fonts and Three.js are committed locally. [site/dependencies.lock](site/dependencies.lock) pins the renderer version, verification-tool versions and SHA-256 hashes of runtime assets. It is an asset lock, not an npm installation manifest. The existing Foundry configuration and dependencies were not changed.

### Preview and rebuild the export

Use Python 3 from the repository root:

```sh
python3 tools/build_site.py
python3 tools/preview_site.py --port 8765
```

Open `http://127.0.0.1:8765/preview/`. The preview server supplies an explicitly empty launch-data fixture at `/simd-coin.json`; it is never copied into the export. Stop it with Ctrl-C. The build command validates pinned assets and the downloadable token source, then copies runtime files byte for byte into `dist/`. You can also serve `site/` directly with any static HTTP server; it has no required build step. ES modules should be served over HTTP rather than opened as `file://` URLs.

### Optional development checks

Node 22+, Python 3 and a Chromium-compatible environment are needed for the browser checks. Install verification tools outside the repository, including caches and browser binaries:

```sh
npm install --prefix /tmp/sfpt-checks --cache /tmp/sfpt-npm-cache --no-audit --no-fund typescript@5.9.3 @playwright/test@1.56.1 @axe-core/playwright@4.11.0
PLAYWRIGHT_BROWSERS_PATH=/tmp/sfpt-browsers /tmp/sfpt-checks/node_modules/.bin/playwright install chromium
/tmp/sfpt-checks/node_modules/.bin/tsc --allowJs --checkJs --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM site/core.js site/app.js site/room.js
PLAYWRIGHT_BROWSERS_PATH=/tmp/sfpt-browsers node tools/validate_site.mjs
forge build
forge test
```

The validation script owns and closes its preview on port 8766. Set `SFPT_CHECK_DEPS` if the tool packages are installed somewhere other than `/tmp/sfpt-checks`. It records results and full-page screenshots under disposable `test/scratch/site-validation/`. It uses controlled feed responses; the supplied treasury address is used as a token-address fixture only inside this test. No such token address is shipped in the production site.

**Actual final results:** production export and JavaScript typecheck passed. The export contains three pages and 17 runtime files (873,941 bytes). Browser validation passed 20 check groups and all 24 page/viewport combinations, with zero violations in six axe scans and no baseline console errors, failed assets or dead local links. Checked widths: 320, 360, 375, 390, 768, 1024, 1440 and 1920px. The 390px first screen shows the product and main action. Exact token arithmetic, keyboard navigation, pending/error/success data states, logo updates, sharing, copying, the virtual 30-second refresh, reduced motion and WebGL fallback passed. Foundry passed all 23 tests, including three 1,000-case fuzz tests.

See [DESIGN.md](DESIGN.md) for implemented tokens/components and [VALIDATION.md](VALIDATION.md) for the six-domain Better Interface review, fixes, measured contrast and honest coverage limits. Selected screenshots are [desktop](artifacts/site-desktop.jpg) and [mobile](artifacts/site-mobile.jpg). Native screen-reader sessions, browser-native 200% zoom, physical devices, Safari/Firefox, a live Ethereum fork and production market/deployment verification were not performed. Software-WebGL screenshot warnings were observed; normal application errors were not.

### Publish

Publish the **contents of `dist/`** at `https://superfrenpettest.si-md.xyz/`, including `docs/`, `assets/` and `vendor/`. No npm install, application server or rebuild is needed at the host. The source uses relative asset URLs and was tested beneath `/preview/`; it also works at a static gateway subpath. The intended canonical/share origin remains the published domain.

The launch host must supply `/simd-coin.json` on the same origin with `token`, `coinUrl`, `chartUrl`, optional `logo`, and `market.priceUsd`, `market.marketCap`, `market.volume24h`. That endpoint is deliberately origin-relative even when the static site is served under a subpath. Until data arrives, addresses show “launching…”, market values show dashes and Buy/Chart links remain unavailable. Docs stays the highlighted available action. HTTPS links from the feed are validated before use. A changed logo is preloaded and preferred; a failed replacement preserves the bundled reference. No wallet connection, API credential, analytics script or personal-data form is present.

Serve `docs/index.html` at `/docs/`, retain the `.sol` source download, and configure missing pages to **redirect to `/404.html`** (or the corresponding deployment subpath), rather than internally serving it at an arbitrary nested URL. This keeps its relative styles and images valid. The site's full social metadata uses the bundled logo; non-JavaScript crawlers require an HTML republish to see a later logo override. This task prepares the export; it does not broadcast contracts or publish to the live host.

Runtime attribution is in `site/vendor/THREE-LICENSE.txt` (Three.js 0.160.1, MIT) and `site/assets/fonts/*-LICENSE.txt` (Google Fonts families, SIL OFL). The creator's supplied logo is used unchanged. Design-guide attribution and licenses accompany the validation artifacts. No ignore file was modified; generated dependencies, caches and browser output are kept outside the Git deliverable.

## Existing token and logo work

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
