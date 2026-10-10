# Super Fren Pet Test design system

## Overview

The site introduces the SFPT test token through a cozy, isometric pet room and readable protocol mechanics. It is deliberately dark, quiet and green: cream paper walls, a pixel pet based on the supplied LCD logo, and a warm desk lamp. The hero says “Small fren. Clear rules.” and immediately identifies the product, the test warning and the available action.

The implementation is plain HTML, CSS and JavaScript in `site/`. `site/styles.css` is the design source of truth; `site/index.html`, `site/docs/index.html` and `site/404.html` share it. `dist/` is an identical runtime export. The room lives in `site/room.js`, using locally pinned Three.js. It is an illustration, not a wallet or pet game. The bridge, keeper, leaderboard and HUD are explicitly conceptual.

## Colors

All interface tokens are defined in the `:root` block of `site/styles.css`. Hex notation is canonical.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#101713` | Page and inset calculator background |
| `--surface` | `#17211b` | Cards and alternating section surfaces |
| `--surface-raised` | `#1c2921` | Hover, selected and notification surfaces |
| `--border` | `#34463a` | Structural separators and control borders |
| `--text` | `#f1f3e9` | Primary text |
| `--muted` | `#abb9ab` | Body descriptions, captions and unavailable states |
| `--accent` | `#b6efa0` | Main action fill and selected brand highlights |
| `--accent-hover` | `#cdfbbd` | Main action hover |
| `--accent-ink` | `#142518` | Text on accent fills |
| `--moss`, `--moss-light` | `#1f8a4c`, `#2fa85c` | Creator's palette reference, mirrored in the room materials |
| `--paper` | `#e5ead8` | Paper palette reference for the scene |
| `--warning` | `#e6cf98` | The explicit test-launch notice |
| `--error` | `#ffc0ac` | Calculator validation text |
| `--focus` | `#e4ffc9` | Two-pixel keyboard focus outline |

The room's physically lit material colors are separately defined in `site/room.js`; they are not text-contrast tokens. The cream walls use `0xe2e7d4`, the pet `0x2fa85c`, and the nest glow `0xb8f190`. Lighting and tone mapping change their rendered appearance.

Computed solid-color pairs measured in Chromium: primary text/page 16.24:1, muted/page 8.89:1, muted/surface 8.08:1, muted/raised 7.39:1, primary-button ink/fill 12.12:1, warning/page 11.91:1, error/page 11.60:1. The focus/page and focus/raised pairs are 16.85:1 and 14.01:1. These measurements do not establish contrast for scene textures or every translucent/gradient background; see `VALIDATION.md`.

## Typography

Three Google Fonts families are served locally as WOFF2, with their SIL OFL licenses in `site/assets/fonts/`:

- Space Grotesk, variable 400–700: display headings and brand. Fallback: sans-serif.
- DM Sans, variable 400–700: prose, buttons and navigation. Fallback: sans-serif.
- IBM Plex Mono, regular 400: token amounts, addresses, section indices and telemetry. Fallback: monospace.

The six size tokens are `--text-xs` 13px, `--text-sm` 15px, `--text-base` 16px, `--text-lg` 20px, `--text-title` clamp(32px, 3.5vw, 48px), and `--text-display` clamp(48px, 5.2vw, 76px), at the default 16px root size. The mobile hero uses the same 48px display minimum. The rendered desktop sample had exactly six distinct interface sizes.

Heading weights are 500; strong text is 600; prose is 400. H1 line height is 1.06 with −0.055em tracking, H2 1.15/−0.04em, and H3 1.4/−0.025em. Prose is generally 1.6, with detailed card/FAQ prose at 1.7. Headings balance, descriptions wrap prettily, and token addresses/outputs break anywhere instead of truncating. Changing numbers use tabular numerals. Section labels use normal case without letter spacing. Prose measures are capped around 48–60ch where applicable.

## Layout

The common `.container` caps content at 1248px. Its gutters are 48px on wide screens, 32px below 1150px, and 20px below 800px. A twelve-column grid aligns the desktop hero, calculator and guide. The hero allocates five columns to copy and seven to the room. Section spacing is 96px, becoming 64px below 800px and 56px below 480px. The spacing tokens cover 4, 8, 12, 16, 24, 32, 48, 64 and 96px.

Responsive changes are content-specific:

- At 1150px: remove the optional header CTA, use two feature columns, and enlarge the calculator's share of its grid.
- At 800px: collapse navigation behind a native Menu button; stack hero, calculator, security, FAQ and buying guide; use two telemetry columns. Header height is 76px instead of 88px.
- At 480px: stack features and timeline, compact cards, place flow destinations beneath the source, and use a 340px-high scene viewport. The 3D camera independently adjusts its orthographic bounds to preserve the whole diorama.
- At 1600px: increase the room height to 530px and hero minimum height to 760px. The content width remains capped.

All three pages were checked at 320, 360, 375, 390, 768, 1024, 1440 and 1920px without document overflow. At 390×844, the product name, test warning, Buy state and filled Docs action appear in the first screen. No horizontal overflow is hidden as a workaround.

## Elevation & Depth

One-pixel borders communicate layout and component boundaries. Feature cards use a one-pixel shadow ring. The dark hero's faint grid and soft radial glow frame the real-time room without a heavy card. The room itself uses orthographic perspective, soft shadow maps, hemispheric light, a warm lamp and green nest light.

The sticky header uses an opaque-enough dark overlay with blur and z-index 30. Notifications use a raised surface, ambient shadow and z-index 50. The skip link sits at 100. The hero HUD is a translucent green overlay with its own border; meaningful information is repeated as normal DOM text outside the canvas.

## Shapes

Radius tokens are 6px for buttons/small inner surfaces, 12px for panels, and 20px for the closing CTA. Pills use a full capsule. Logo corners vary with display size (9px in navigation, 18px in the guide, 36px in the fallback). The pet's block silhouette and stepped ears derive from the supplied logo; the 3D body adds small bevels, while its eyes and smile remain pixel-shaped.

## Components

| Pattern | Source / selectors | Behavior and reuse |
| --- | --- | --- |
| Header | `index.html`, `.site-header`, `.menu-toggle`, `app.js` | Sticky, anchor navigation; Menu exposes links, Escape closes and returns focus. It is a nonmodal disclosure. |
| Actions | `.button`, `.button-primary`, `.button-small`, `.text-link`, `.icon-button` | 44px minimum small targets, 52px regular buttons, visible focus, hover and 0.96 active scale. Unavailable links have no `href` and have `aria-disabled`; unavailable buttons use `disabled`. Docs has primary emphasis until a feed-supplied Buy link exists. |
| Shared den | `room.js`, `.scene-wrap`, `.den-controls` | Loaded after first paint. Pointer/scroll camera drift, pet idle movement, and a two-route buy demonstration. Pauses outside the viewport and in hidden tabs. Visible pause control and live reduced-motion handling. Local logo fallback survives missing WebGL. |
| Live telemetry | `app.js`, `core.js`, `[data-stat]` | Same-origin feed every 30 seconds while visible, 8-second timeout, manual refresh, animated changes, dashes for missing/failed values. Never invents a token address or market data. Last confirmed links are labeled as cached after an error. |
| Mechanism flow | `.flow-panel`, `.flow-progress`, `app.js` | Animated SVG route; scrolling highlights source, treasury and recipient. The real 2%/98% split remains visible throughout. Sells and the separate pool fee are explained below. |
| Calculator | `core.js`, `#buy-amount`, `#buy-range` | Exact BigInt arithmetic at 18 decimals; input accepts up to total supply, slider spans 0–1M whole SFPT. Invalid input marks the field and clears outputs. A labeled live result region announces updates. |
| Contract card | `[data-address]`, `[data-copy-contract]`, `[data-explorer]` | Pending state reads “launching…”. Copy and explorer activate only on a valid feed address. Persistent, dismissible feedback handles clipboard success or manual-copy fallback. |
| Buying guide | `[data-step]`, `#guide-next` | Three native buttons with `aria-pressed`; Next cycles wallet, ETH/IMD and coin-page guidance. All steps remain educational. |
| FAQ | Native `details` / `summary` | Browser keyboard behavior, visible disclosure symbol, expandable prose. No custom accordion dependency. |
| Share | `[data-share]`, `#copy-link` | Three distinct X intents, each with the test notice; copy the canonical URL. No sharing SDK or tracker. |

Motion uses `cubic-bezier(.2,0,0,1)` for state changes and 150ms control transitions. Reveals use 650ms and 100ms staggers. Counter changes use 650ms; flow travel uses a five-second loop only while visible. CSS movement is inside `prefers-reduced-motion: no-preference`; JavaScript disables camera drift, idle motion and counter animation when reduced motion is requested. A pause stops room and flow loops.

## Do's and Don'ts

- Start a page with the shared stylesheet, `.container`, a skip link, one main landmark, and one H1. For another static page, create `site/<page>/index.html` and use `../` asset paths, following `site/docs/`.
- Keep the authoritative token identity SFPT and the creator's test notice. Distinguish concept scenery from actual transfer mechanics.
- Use one primary action per area; preserve clear pending and error states. Do not manufacture a Buy URL or a contract address.
- Extend the existing six-size scale and role tokens only when the content requires it. Avoid purple, casino styling, tracked uppercase labels and invented live pet statistics.
- Keep all runtime dependencies local. Re-export with `tools/build_site.py` after editing source, and rerun the affected checks.
- Keep monetary arithmetic in `core.js` as integers. Do not apply the 2% rate to combined buy/sell dollar volume or imply automatic FP staking.

Design review used the pinned Better Interface guidance by Jakub Krehel (MIT, `267330e1adfc66a718fb65fa6918c1f06d0a689e`), with documentation guidance adapted from Paul Bakaus's Impeccable (Apache-2.0, `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). Attribution and license text are retained with the review artifacts.
