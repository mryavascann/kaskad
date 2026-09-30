# Stage 6 measurements: Metropolis frontend

- **Commit measured:** `e00ef63459b9728a5088fe4fd27ef20c0076bc05` (`feat/metropolis-frontend`, detached worktree, `npm ci` + `next build`, `next start --port 3100`)
- **Date:** 2026-09-30. Next.js 16.3.6 (Turbopack). Lighthouse 12 with Playwright Chromium 1243, headless (`--headless=new`), local server (no CDN, no HTTP/2).
- **Targets (brief section 9):** landing JS ≤ ~250 KB gzip initial; Lighthouse mobile Performance ≥ 90, A11y / BP / SEO ≥ 95; LCP < 2.5 s; CLS < 0.05; no horizontal scroll at 360–1920.

## Verdict

| Criterion | Result | Pass |
|---|---|---|
| Landing initial JS ≤ ~250 KB gz | **398.5 KB** gz (23 eager chunks) | FAIL |
| three / R3F / GSAP lib / Lenis / cmdk not in `/` initial chunks | Not in them. Only the 12.4 KB GSAP *loader* stub is eager | PASS |
| Mobile Performance ≥ 90 | 41–81 (landing median 44) | FAIL (all pages) |
| Accessibility ≥ 95 | 96–100 | PASS |
| Best Practices ≥ 95 | 100 | PASS |
| SEO ≥ 95 | 90 on every page (one cause: relative hreflang) | FAIL (trivial fix) |
| LCP < 2.5 s (mobile) | 3.7–5.3 s | FAIL |
| CLS < 0.05 | 0 – 0.024 | PASS |
| No horizontal scroll (360…1920) | 0 overflows on 34 page×width loads | PASS |
| Console errors / page errors | none | PASS |

## 1. Build route table

`next build` succeeded (compiled in 41 s, TypeScript in 51 s, 27 static pages). Next 16 removed the "Size / First Load JS" columns (see `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`), so bundle sizes below are measured directly.

| Route | Type | Revalidate |
|---|---|---|
| `/`, `/tr` | ○ static (ISR) | 10 min |
| `/app`, `/tr/app`, `/guard`, `/tr/guard`, `/how-it-works`, `/tr/nasil-calisir` | ○ static (ISR) | 1 h |
| `/wallet`, `/tr/cuzdan` | ○ static | – |
| `/api/fund`, `/api/position`, `/api/rpc`, `/design` | ƒ dynamic | – |
| `*/opengraph-image-*` (10) | ○ static | 1 h on data pages |

Build warning: `metadataBase` is not set, so OG/twitter images and alternates resolve against `http://localhost:3000` (this is also the SEO failure below).

## 2. Bundle (gzip -9 of the chunk files the server HTML loads as `<script src async>`, `noModule` polyfills excluded)

| Page | Eager chunks | Initial JS (gz) | Lazy after `load` (gz) | Heavy libs in initial |
|---|---|---|---|---|
| `/` | 23 | **398.5 KB** | 415.9 KB (13 chunks; three+R3F chunk alone 254.7 KB) | none |
| `/tr` | 23 | 398.5 KB | 415.9 KB | none |
| `/app` | 26 | 448.2 KB | 39.8 KB (GSAP) | none |
| `/guard` | 22 | 366.2 KB | 56.4 KB | none |
| `/wallet` | 23 | 381.7 KB | 39.8 KB | none |
| `/how-it-works` | 19 | 335.6 KB | 63.5 KB | none |

The polyfill chunk (38.5 KB gz) is `noModule`, so modern browsers skip it; it is excluded above. HTML documents: `/` 50.7 KB gz, `/tr` 49.5 KB, `/how-it-works` 31.1 KB, `/app` 20.7 KB.

**Heavy libraries on `/`.** three.js, `@react-three/fiber`, the GSAP library + ScrollTrigger, Lenis and cmdk are **not** in the initial chunks. They load after `load`, as designed. Chunk `3q40_r5qpy483.js` (12.4 KB) is eager and matches "ScrollTrigger", but it only holds the `loadScrollKit()` dynamic-import stubs plus landing client code. `cmdk` is only in `2tpj2x95keroh.js`, which no page loads eagerly.

**What fills the 398.5 KB on `/`** (signature grep of each eager chunk):

| Group | ≈ KB gz | Why it is on the landing |
|---|---|---|
| React DOM + Next runtime | ~118 (69.8 + 41.7 + small) | framework |
| **viem + @noble + abitype** | **~105** (43.5 + 22.2 + 13.8 + 12.8 + 12.8) | `shell/site-nav.tsx` → `useLiveBlock` → `lib/chain/reader.ts` (`createPublicClient`, `viem/chains`) in the nav of *every* page; `views/landing/wallet-teaser.tsx` imports `isAddress` from viem plus `SAMPLES` from `lib/chain/wallet.ts`, which pulls `engine`, `scenario` and `lib/kaskad/math` |
| **motion (framer)** | **~95** (24.3 + 21.0 + 19.5 + 16.5 + 15.5 + 13.9 + 6.2, shared with radix/number-flow/sonner) | Reveal/Stagger, NumberFlow, MotionProvider in the root layout |
| Radix + sonner + tailwind-merge + app code | ~80 | Tooltip/Toaster providers in the root, UI kit |

Lighthouse "unused-javascript" on `/`: 223 KiB, led by the lazy three chunk (115 KB unused) and `0g7_0z36h5f4d.js` (viem, 32 KB unused).

## 3. Lighthouse

Mobile uses the default preset (Moto G Power, 4× CPU, slow 4G, simulated). `/` mobile ran 3 times; the median run is shown.

| Page | Preset | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS | SI | LCP element |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` (runs 46 / 44 / 42) | mobile | **44** | 96 | 100 | 90 | 1.7 s | **4.9 s** (4.3 / 4.9 / 4.8) | **22,040 ms** (21.6k / 22.0k / 24.3k) | 0 | 7.3 s | `h1` SplitText `span.block` |
| `/tr` | mobile | 49 | 96 | 100 | 90 | 1.9 s | 5.1 s | 4,960 ms | 0 | 3.7 s | finding figure `span` (NumberFlow digits) |
| `/app` | mobile | 41 | 99 | 100 | 90 | 1.9 s | 5.3 s | 11,580 ms | 0 | 7.9 s | `span.label-mono.text-fg-3` |
| `/guard` | mobile | 61 | 98 | 100 | 90 | 1.4 s | 3.9 s | 1,680 ms | 0.024 | 1.4 s | hero lead `p.text-lead` |
| `/wallet` | mobile | 75 | 98 | 100 | 90 | 1.4 s | 4.4 s | 390 ms | 0 | 1.4 s | hero lead `p.text-lead` |
| `/how-it-works` | mobile | 81 | 100 | 100 | 90 | 1.5 s | 3.7 s | 340 ms | 0 | 1.5 s | hero lead `p.text-lead` |
| `/` | desktop | 62 | 96 | 100 | 90 | 0.5 s | 1.1 s | 3,800 ms | 0 | 2.6 s | `h1` span |
| `/app` | desktop | **98** | 99 | 100 | 90 | 0.4 s | 1.0 s | 50 ms | 0.006 | 0.9 s | `p.text-caption` |
| `/` diagnostic, `--disable-webgl` (poster only) | mobile | 55 | – | – | – | – | 4.4 s | 1,980 ms | 0 | 3.3 s | `h1` span |

**LCP breakdown.** Every page has TTFB ≈ 0.47 s, zero load delay and zero load time (text LCP), and a *render delay* of 3.2–4.8 s. The *observed* (unthrottled) LCP is ~0.33 s. The simulated LCP is high because Lantern puts the whole eager JS set (335–448 KB gz over simulated slow 4G) and 3–4 render-blocking CSS files in front of the LCP paint. **Cutting eager JS is the main lever for LCP on every page.**

### Failing audits (below target)

**Performance, `/` (44)**
- `total-blocking-time` 22 s. `long-tasks`: `26z5y3xewknxi.js` (GSAP library) holds a **10,000 ms** task at t=9.2 s and a 6,089 ms task at t=21.7 s. The CPU profile shows ~10 s of native `(program)` time under GSAP's rAF ticker: the **3D hero ran in `scene` mode (`data-reason="capable"`) on headless Chrome's software WebGL (SwiftShader)**. `failIfMajorPerformanceCaveat` did not reject it, and each ScrollTrigger/ticker frame renders the R3F canvas synchronously on the CPU. With `--disable-webgl` TBT drops from 22 s to 2.0 s (perf 44 → 55).
- `bootup-time` 14.3 s: `26z5y3xewknxi.js` 14.7 s, `3p54rou3ppxua.js` (react-dom) 6.9 s, `3cdhrk_38kdkq.js` (three) 6.6 s, document 2.8 s.
- `mainthread-work-breakdown` 34.6 s (other 16.6 s, script 14.1 s, style/layout 2.4 s).
- `largest-contentful-paint` 4.9 s: see the LCP breakdown above.
- `render-blocking-insight` ≈ 700 ms: `3-j0ukad1sgtw.css` (114 KB raw / 19.6 KB gz Tailwind bundle), `09uhg22u7d6n0.css` (12 KB, module CSS), `3w9r6dufbkk25.css` (fonts), `3n_7wchvznnub.css` (345 B Lenis CSS: its own render-blocking request).
- `unused-javascript` 223 KiB (three 115 KB unused, viem chunk 32 KB, `45arufgp9p9ho.js` 29 KB, `20nrokvgn11yu.js` 25 KB).
- `legacy-javascript` 13–14 KiB in react-dom chunk `3p54rou3ppxua.js`. `dom-size` 825 elements (NumberFlow `span.digit__num` ×many).
- `forced-reflow-insight`: 331 ms unattributed.

**Performance, `/app` (41)**
- `total-blocking-time` 11.6 s. Long tasks come from the document (`/app` 1,175 ms, 794 ms, 695 ms) and ~10 tasks in react-dom of 470–940 ms spread over 6–17 s: repeated re-renders after load (live preview, signer balances, NumberFlow, Monte Carlo auto-run). `mainthread-work-breakdown` 26 s, with **style/layout 7.6 s**.
- `dom-size` **1,745 elements** (PositionTiles, wave timeline, preset cards, Monte Carlo dots).
- `forced-reflow-insight`: react-dom (105 ms), radix `3x-eerbhgxg0h.js` (80 ms + 43 ms), sonner/radix `351iqe7mo8tfg.js` (19 ms).
- `uses-text-compression`: `/api/rpc` responses are uncompressed (17 KB + 5 KB).
- `unused-javascript` 75 KiB (viem 31 KB, react-dom 23 KB, NumberFlow/motion 21 KB).

**Performance, `/tr` (49), `/guard` (61), `/wallet` (75), `/how-it-works` (81)**
- LCP 3.7–5.1 s with render delay (eager JS + render-blocking CSS). `/tr` TBT 4.96 s (react-dom 5.8 s bootup, 1,575 DOM elements). `/guard` TBT 1.68 s. `unused-javascript` 101 KiB on guard/wallet/how (viem 32 KB, react-dom 25 KB, motion 23 KB, NumberFlow 21 KB). `/guard` also serves `/api/rpc` uncompressed (17 KB).

**Performance, `/` desktop (62)**: TBT 3.8 s (GSAP chunk 2.2 s bootup, three 1.3 s), max-potential-FID 1.96 s: the same WebGL-in-software cause.

**Accessibility (all pass ≥ 95, but these audits fail)**
- `color-contrast` (`/`, `/tr`): elements of the "why on-chain" **Kaskad result card** (`#on-chain`), at 1.39–1.99:1 (`dt.label-mono.text-fg-3` #2b2b34, `dd.text-fg-1` #43434a, `a` MonadScan link, `p.text-body-sm`), and of the Why-Monad BlockPulse (`h3#block-name.text-monad-hi` #32304b, `li.rounded-tag.bg-monad/10` chips) on #0b0b13. These are the ghost/unrevealed states of the scrubbed unlock (`views/landing/onchain-unlock.tsx`, `--unlock` driven by `useScrollProgress(start "top 80%", end "center 45%")`) and of Reveal (`motion/reveal.tsx`, `initial={{ opacity: 0 }}`) below the fold.
- `label-content-name-mismatch` (all pages): the locale link has `aria-label="Türkçe"` / `"English"` but visible text "TR" / "EN" (`shell/` locale switch). On desktop, also the search button: `aria-label="Search pages, scenarios and addresses"` vs visible "Search Ctrl K". `/how-it-works`: proof-ledger MonadScan links (`a[href^="https://testnet.monadscan.com/tx/0xc80d…"]`) have an aria-label that doesn't contain their visible text.
- `heading-order` (`/app`, `/guard`, `/wallet`): `h3.label-mono.text-fg-3` without a preceding `h2` (`/app`: `aside.col-span-full > div.relative > div.flex > h3` in the signer strip; `/guard` rule card; `/wallet` check card).

**Best Practices**: 100 everywhere. `valid-source-maps` is flagged (unscored) for `3cdhrk_38kdkq.js` (the large three chunk has no source map).

**SEO (90 on every page)**: `hreflang` fails with "Relative href value" on `<link rel="alternate" hreflang="en|tr|x-default" href="/…">`. The build warning confirms it: `metadataBase` is unset, so `languageAlternates()` emits relative URLs.

## 4. Screenshots

Folder: `web/design-review/metropolis/` (production build, `deviceScaleFactor` 1, `isMobile` below 768). Landing shots wait 15 s for the 3D hero (`data-mode="scene"` at every width; at 1024 `data-ready` was never set within 15 s, but the canvas is visible). Other pages wait 5 s.

| Page | Viewport PNG (first screen) | Full page JPEG q70 |
|---|---|---|
| `/` | `home-{360,390,768,1024,1440,1920}.png` | `home-390-full.jpg`, `home-1440-full.jpg` |
| `/` shock scene mid-scroll (wheel) | `home-390-scene-{1..4}.png`, `home-1440-scene-{1..4}.png` | – |
| `/app` | `app-{360,…,1920}.png` | `app-390-full.jpg`, `app-1440-full.jpg` |
| `/guard` | `guard-{360,…,1920}.png` | `guard-390-full.jpg`, `guard-1440-full.jpg` |
| `/wallet?address=0x815f5BB257e88b67216a344C7C83a3eA4EE74748` | `wallet-{360,…,1920}.png` | `wallet-390-full.jpg`, `wallet-1440-full.jpg` |
| `/how-it-works` | `how-it-works-{360,…,1920}.png` | `how-it-works-390-full.jpg`, `how-it-works-1440-full.jpg` |
| `/tr` | `tr-390.png`, `tr-1440.png` | – |
| `/tr/app` | `tr-app-390.png`, `tr-app-1440.png` | – |

Note: in the landing full-page JPEGs the sticky shock scene shows as ~2,000 px of empty dark space. This is a capture artifact of `fullPage` with sticky/pinned content. The `home-*-scene-*.png` viewport shots show the scene working during real wheel scrolling.

### Horizontal overflow

`document.documentElement.scrollWidth > clientWidth` was checked on first load and again after scrolling the page top to bottom (390/1440). **0 overflows in 34 loads** (all pages × all widths, including TR). No `pageerror` or console `error` on any load.

## 5. Visual defects (ranked by severity)

**High**
1. **`/` at 360×740: the hero overflows the first screen.** The panel starts at y=41 under the 61 px sticky header, so the Winner badge's top edge is hidden behind the header. The readout strip (block / oracle price / drop …, `position: sticky` bottom) covers the lower half of the second CTA "Is my position safe?" (`home-360.png`). At 390×844 it just fits, with no gap between the CTA and the strip (`home-390.png`). The same applies to `/tr` at 390 (`tr-390.png`: "Param güvende mi?" is cut by the strip).
2. **`/` "Why on-chain": the Kaskad result card stays in its ghost state** (blurred, ~25% opacity) whenever it isn't inside the scrub band (`home-1440-full.jpg`, `home-390-full.jpg`, section 02). The unlock is *scrubbed*, so scrolling past and back, or stopping early, leaves the key "on-chain / verifiable" card unreadable. This is also the landing's `color-contrast` failure.
3. **`/tr` 390 (intermittent, 1 of 3 loads): the hero lost its per-position data.** The client showed an older block (#67.064.466 vs server #67.066.762), the dominoes rendered as the neutral row, the readout reset to `BLOK 00/20 · %0,0`, and "EŞİĞİN ALTINDA" stayed a skeleton after 15 s (`tr-390.png`). Two later loads were correct. A client refresh that reads a lagging RPC node replaces a consistent server finding with an inconsistent one and never recovers.

**Medium**
4. **Shock scene: the loop diagram overlaps the domino row.** At 1440 (`home-1440-scene-2.png`) the "New liquidations" chip and the red return bracket sit on top of the first dominoes, and "↺ AND AGAIN" is nearly invisible. At 390 (`home-390-scene-3.png`) the whole diagram (three chips + bracket) is drawn over the lit dominoes, and "AND AGAIN" is hidden behind them.
5. **Why-Monad GasGauge: provenance chips break mid-word at 1440.** "MEASURE / D" and "ESTIMAT / E" wrap inside the fixed-width label column (`home-1440-full.jpg`, section 03). At 390 they fit.
6. **`/wallet` 390: the deposit-side table is clipped.** The 4th column "WITHDRAWAL" is cut to "WITHD", and the row reads "collate… lent ou…", with no visible scroll affordance (`wallet-390-full.jpg`).
7. **Data mismatch for the same address:** the landing wallet teaser shows HF **1.02**, "liquidatable after a **−2.30%** drop" for the largest syrupUSDC borrower. `/wallet?address=0x815f…4748` shows HF **1.022**, "liquidated if syrupUSDC drops **−2.19%**" (`home-1440-full.jpg` section 05 vs `wallet-1440-full.jpg`). The two use different sources or snapshots without saying so.
8. **`/` at 768×1024: the hero is bottom-anchored** with ~380 px of empty space above the badge (`home-768.png`). Portrait tablets see a blank top half.
9. **`/app` WaveTimeline: a blurred grey band** runs just below the chart and extends past the chart's left/right edges (x≈487–1400 at 1440, full width at 390; `app-1440-full.jpg`, `app-390-full.jpg`). I couldn't pin it to a DOM element (low confidence: it may be the scrubber track glow), but it reads as a rendering glitch.

**Low**
10. `/app` at 768: the signer strip leaves an empty, lighter grid cell right of "Sponsor budget" (`app-768.png`).
11. `/app` mobile: the first screen is all intro and market stats. The scenario controls start about two screens down (`app-390.png`, `app-360.png`).
12. Landing hero at 390/360: the first domino (amber rim) sits behind the honesty chips and CTA, which lowers chip legibility (`home-390.png`).
13. Pipeline strip ("From the snapshot to the result", landing and `/how-it-works`): the connector segments start mid-gap and don't touch circles 1 and 6.
14. `/` 390 "Kaskad result" card: `#67,066,762` runs into the card's right padding.
15. Hero "Live preview · block #67,066,762" (10-min cache) sits next to the nav's live block (#67,067,5xx): two block numbers on one screen with no "cached" hint.
16. `/app` Monte Carlo (1440): with 0 bad-debt paths, the chart area is ~220 px of empty space above the dot row.

## 6. Top 10 recommended fixes

1. **`three/capability.ts`: reject software GL.** After creating the probe context, read `WEBGL_debug_renderer_info` `UNMASKED_RENDERER_WEBGL` and treat `/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i` as `softwareRenderer: true` → poster. Also gate `scene` behind a first user interaction or `navigator.hardwareConcurrency >= 4` on mobile. This is the whole 22 s TBT on `/` (Lighthouse and low-end devices); the diagnostic run shows TBT 22 s → 2 s.
2. **`shell/site-nav.tsx` / `shell/network-status.tsx`: get viem out of every page's initial bundle.** Poll the live block with a tiny `fetch('/api/rpc', {method:'POST', body: eth_blockNumber})` helper instead of `lib/chain/reader.ts` (`createPublicClient` + `viem/chains`), or `next/dynamic` the status pill after idle. Estimated −60 to −100 KB gz on all pages.
3. **`views/landing/wallet-teaser.tsx`: drop `viem` and `lib/chain/wallet.ts`.** Validate with a 1-line regex (`/^0x[0-9a-fA-F]{40}$/`) and move `SAMPLES` to a leaf module without `engine`/`scenario`/`math` imports (e.g. `lib/chain/samples.ts`).
4. **Trim motion from the root.** Render hero and above-the-fold reveals with CSS (as SplitText already does). Load `motion/react` components (Reveal/Stagger, NumberFlow) through `LazyMotion` + `m` with `domAnimation` features, or dynamic import below the fold. Move `Toaster` (sonner) and `TooltipProvider` behind a lazy boundary. Target: landing initial ≤ 250 KB gz.
5. **`app/(en)/layout.tsx` / `app/(tr)/layout.tsx` (or `i18n/config.ts languageAlternates`): set `metadataBase`** (e.g. from `NEXT_PUBLIC_SITE_URL` / `VERCEL_URL`). This fixes `hreflang` (SEO 90 → 100 on every page) and the OG/twitter URLs flagged by the build.
6. **`views/landing/onchain-unlock.tsx`: make the unlock one-shot, not scrubbed.** Once `progress` reaches 1, set `--unlock: 1` and kill the trigger. Keep the default (no-JS / pre-hydration) state at `--unlock: 1` so the card is readable, and let only the ghost → unlock animation run when it enters. This fixes defect 2 and the contrast audit. Apply the same idea to `motion/reveal.tsx`: rise via transform/clip, not `opacity: 0`.
7. **`views/landing/hero*` + `shock-scene.module.css`: fit the first screen at 360–390 and keep the diagram off the dominoes.** Reserve the readout strip's height in the hero (`padding-bottom: var(--readout-h)`), and use `min-height: 100svh` with top-aligned content under `--nav-h` so nothing sits under the header (defects 1 and 8). At < 768, place the loop diagram above the domino horizon (or give it a solid `bg-bg/80` backplate), and move "↺ and again" out of the scene.
8. **`views/console/*` (`/app` TBT 11.6 s, 1,745 DOM nodes):** don't auto-run Monte Carlo / stress / compare on load (run on tab open). Render PositionTiles and the positions table lazily (`content-visibility: auto` on below-the-fold sections, table collapsed until opened). Throttle signer-balance and live-preview polling until idle. Check that the NumberFlow values don't re-render every poll when unchanged.
9. **Accessibility names (`shell/` locale switch, command button, `views/how` proof ledger):** make the accessible name contain the visible text (`aria-label="TR · Türkçe"` or drop the aria-label and add `<span class="sr-only">Türkçe</span>`; the search button's name should start with "Search"). Make the label-mono `h3`s in the `/app` signer strip, `/guard` rule card and `/wallet` check card `h2` (or `p` with `role` none) to fix `heading-order`.
10. **Small visual/data fixes:**
    - `viz/gas-gauge.tsx`: `whitespace-nowrap` on the provenance chip, or widen the label column.
    - `views/wallet/*` deposit table at < 480 px: stack rows as a definition list, or wrap in `overflow-x-auto` with a fade edge.
    - Landing wallet teaser (`views/landing/wallet-teaser.tsx`): read HF and drop from the same `/api/position` source as `/wallet`, or label the snapshot block.
    - `useFinding` on the client: never replace a consistent server finding with an older-block or inconsistent one (compare block numbers, keep the server data on failure).
    - Also: gzip `/api/rpc` responses (`uses-text-compression`), and inline the 345 B Lenis CSS into the main stylesheet to drop one render-blocking request.

## Method notes

- Bundle: eager chunk list parsed from the served HTML (`<script src=… async>`, `noModule` excluded), sizes `gzip -9` of `.next/static/chunks/*`. Library detection by signature grep (`WebGLRenderer`, `GreenSock`, `ScrollTrigger`, `lenis-smooth`, `cmdk-`, `viem@`, etc.). Lazy sizes from a Playwright run that records `script` responses after `load` (15 s on `/`).
- Lighthouse runs were sequential against `next start` on :3100. Raw JSON is kept out of the repo (size); the numbers above are copied from it.
- No transactions were sent and no prove/run/borrow buttons were clicked. `/wallet?address=` was loaded once per width (6 loads; the Lighthouse `/wallet` run had no address). The worktree and the :3100 server were removed after measuring.
