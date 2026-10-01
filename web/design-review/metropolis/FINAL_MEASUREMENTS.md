# Final measurements: Metropolis frontend (QA gate)

- **Commit measured:** `25629a8` (`feat/metropolis-frontend`). Its only change on top of `cab0720` is `web/REDESIGN_PLAN.md`, so the code is the same as `cab0720`. Detached worktree, `npm ci`, `next build`, `next start --port 3200`. Server stopped by PID afterwards.
- **Date:** 2026-10-01. Next.js 16.3.6 (Turbopack), Node 24.21.0, Lighthouse 12.8.2, Chrome for Testing 153.0.8010.12 (Playwright `chromium-1243`), `--headless=new --no-sandbox`. Local server: no CDN, HTTP/1.1, gzip from `next start`.
- **Machine:** VPS, 12 vCPU AMD EPYC, 48 GB RAM. No other agent was running. The `:3000` dev server was idle.
- **Build:** clean. The build log has no errors, warnings, retries or failed chain reads. 27 static pages were generated in 18.2 s. `/`, `/tr`, `/app` and `/tr/app` revalidate every 10 min. `/guard` and `/how-it-works` revalidate every 1 h.
- **Checks on this commit:** typecheck and lint are clean. Unit tests: 131 files / 905 tests pass. E2E was not re-run here; the plan records 54 pass and 10 by-design skips at `cab0720`.

## Verdict against brief section 9

| Criterion (section 9) | Measured here | Result |
|---|---|---|
| Landing initial JS ≤ ~250 KB gzip | **190.1 KB** (method a) / **190.9 KB** body, 207.0 KB with headers (method b) | **PASS** |
| 3D and charts lazy/dynamic | three, R3F, GSAP, Lenis, cmdk, viem and Mera are absent from `/`'s initial scripts. viem is absent from every page's initial scripts | **PASS** |
| Lighthouse mobile Performance ≥ 90 | Medians 56–68 (range 47–83) | **FAIL**, short by 22–34 points |
| Lighthouse Accessibility ≥ 95 | 100 on every run | **PASS** |
| Lighthouse Best Practices ≥ 95 | 100 on every run | **PASS** |
| Lighthouse SEO ≥ 95 | 100 on every run | **PASS** |
| LCP < 2.5 s (mobile) | Lab (simulated slow 4G + 4× CPU): medians 3.0–4.1 s, best run 2.79 s. Observed (unthrottled): 0.38–1.28 s | **FAIL** in the lab, by 0.5–1.6 s |
| CLS < 0.05 | 0.000 on mobile. Max 0.007 (desktop `/guard`) | **PASS** |
| INP < 200 ms | Needs field data or an interaction trace; not measured. Proxy: lab TBT medians are 1.0–2.7 s on mobile, so INP during load would likely miss | **NOT MEASURED** (risk) |
| Scroll scenes at 60 fps; 3D quality drops when over 16 ms | Not measured in this pass. The 3D hero falls back to the poster on software GL (see MEASUREMENTS fix 1) | **NOT MEASURED** |
| Responsive 360–1920, no horizontal scroll | 0 overflow on 34 screenshot loads plus 10 routes at 360 (first screen and after scrolling to the bottom) | **PASS** |
| Contrast AA, accessible names | Lighthouse a11y is 100. One zero-weight audit still fails: `label-content-name-mismatch` on the `/how-it-works` contract links | **PASS** (one nit) |
| Keyboard flows, reduced motion, `aria-live` | Not re-tested here. E2E keyboard checks pass per the plan | Not re-tested |
| No hardcoded numbers (`rg` report) | `scripts/hardcoded-numbers.sh --summary`: 632 literals in 68 files, mostly geometry and three/viz (flagged `geometry-heavy`). Live checks below show the headline metrics come from chain or preview | Report produced; not audited line by line |
| Tests green (typecheck, lint, unit) | Green. E2E taken from the plan | **PASS** |
| No console errors | 0 errors and 0 warnings on all 10 routes, and on all 34 screenshot loads | **PASS** |

**Main miss:** mobile Lighthouse Performance and the lab LCP. Every page's LCP is server-HTML text with zero load delay. In every median run, 2.5–3.6 s of the lab LCP is *render delay*: Lantern's 4× CPU simulation puts the main-thread work before the LCP paint (React DOM + Next runtime boot, hydration of a 1.5k-node landing DOM, and the 79 KB gz HTML parse). See "Why mobile perf misses" below.

## 1. Lighthouse

Method: one `next start`, routes warmed once, runs strictly sequential. Before each run the script waited until the 1-minute load average was under 1.5, polling every 10 s (waits of 0–70 s). The load at the start of each run was 1.17–1.49, plus 0.18 for the retried `/` run 1. Most of that load comes from Lighthouse/Chrome itself. Mobile runs were round-robin over the pages (run 1 of all pages, then run 2, then run 3). The first `/` mobile run failed with Lighthouse `NO_NAVSTART` (a trace error with no metrics) and was re-run at the end.

**Variance is large and comes from the host, not the page.** Lighthouse's own CPU `benchmarkIndex` moved between 1,105 and 1,686 across runs on the same idle VPS. TBT on an unchanged page ranged 526–3,230 ms (`/guard`) and 493–3,983 ms (`/wallet`). The median is reported with the range; read single numbers loosely.

### Mobile (default preset: Moto G Power, slow 4G, 4× CPU, simulated). Median by Performance, 3 runs

| Page | Perf median (range) | A11y | BP | SEO | FCP | LCP (range) | TBT (range) | CLS | SI | DOM | LCP element |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | **59** (47 / 59 / 67) | 100 | 100 | 100 | 1.8 s | **3.6 s** (3.3–4.6) | 2,535 ms (1,340–4,835) | 0 | 3.4 s | 1,520 | hero honesty chip text (`span.label-mono > span`) |
| `/tr` | **63** (73 / 63 / 57) | 100 | 100 | 100 | 2.1 s | **3.0 s** (3.0–3.8) | 2,594 ms (737–2,594) | 0 | 3.2 s | 1,520 | same chip span |
| `/app` | **56** (59 / 54 / 56) | 100 | 100 | 100 | 1.7 s | **4.1 s** (4.0–4.1) | 2,675 ms (1,793–3,245) | 0 | 3.4 s | 715 | header lead `p.text-lead` |
| `/tr/app` | **62** (62 / 56 / 65) | 100 | 100 | 100 | 1.9 s | **3.3 s** (3.3–4.4) | 2,453 ms (1,417–2,453) | 0 | 2.5 s | 793 | header lead `p.text-lead` |
| `/guard` | **68** (82 / 59 / 68) | 100 | 100 | 100 | 1.1 s | **3.6 s** (2.8–3.8) | 1,054 ms (526–3,230) | 0 | 1.5 s | 305 | header lead `p.text-lead` |
| `/wallet` | **59** (83 / 59 / 59) | 100 | 100 | 100 | 1.1 s | **4.0 s** (2.9–4.0) | 2,586 ms (493–3,983) | 0 | 1.6 s | 224 | header lead `p.text-lead` |
| `/how-it-works` | **60** (72 / 58 / 60) | 100 | 100 | 100 | 1.6 s | **3.7 s** (3.6–4.1) | 2,310 ms (748–2,471) | 0 | 2.2 s | 918 | header lead `p.text-lead` |

Observed (unthrottled) LCP in the same median runs: `/` 1.06 s, `/tr` 0.98 s, `/app` 1.28 s, `/tr/app` 0.81 s, `/guard` 0.38 s, `/wallet` 0.67 s, `/how-it-works` 0.90 s. In every run LCP = FCP, TTFB ≈ 0.5 s (simulated), and load delay and load time are 0.

### Desktop (`--preset=desktop`), 1 run

| Page | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS | SI | LCP element |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | **96** | 100 | 100 | 100 | 0.47 s | 0.85 s | 140 ms | 0 | 0.90 s | hero metric `[data-landing-hero-metric]` |
| `/app` | **97** | 100 | 100 | 100 | 0.40 s | 1.11 s | 97 ms | 0 | 0.94 s | `h1` |
| `/guard` | **76** | 100 | 100 | 100 | 0.40 s | 1.01 s | 529 ms | 0.007 | 1.19 s | `h1` |
| `/wallet` | **97** | 100 | 100 | 100 | 0.37 s | 0.90 s | 134 ms | 0 | 0.61 s | `h1` |
| `/how-it-works` | **88** | 100 | 100 | 100 | 0.61 s | 1.11 s | 237 ms | 0 | 1.32 s | `h1` |

Desktop `/guard` (76): long tasks in the document (291 ms) and in viem chunk `2jntej1h-wfxc.js` (190 ms). It was a single run on a slow-benchmark moment, so treat it as likely noisy.

### Failing audits (mobile median runs)

- **`largest-contentful-paint` (all pages):** render delay 2.5–3.6 s. The LCP is text, so nothing loads before it.
- **`total-blocking-time` / `bootup-time` / `mainthread-work-breakdown`:**
  - `/`: 7.0 s main thread (other 2.0, script 2.0, style/layout 1.3, parse HTML 0.9 s). Long tasks: Next runtime `1t4b1cg4167or.js` 839 ms, document tasks 552 / 363 ms, `3mc6dra1m0098.js` (landing client) 243 ms.
  - `/app`: 8.8 s main thread (style/layout 2.3 s). Document tasks 608 / 426 / 372 ms; react-dom `3p54rou3ppxua.js` 2.9 s bootup.
  - `/wallet` and `/guard`: react-dom 2.3–3.0 s bootup, plus the post-paint viem chunk `2jntej1h-wfxc.js` (638 ms task on `/wallet`, 501 ms on `/tr/app`).
  - `/how-it-works`: react-dom 746 ms task, document 674 ms.
- **`unused-javascript`:** 47–81 KiB. react-dom 21–25 KiB and Next runtime 24–25 KiB on every page. viem `2jntej1h-wfxc.js` 31–32 KiB on `/guard`, `/wallet`, `/tr/app`.
- **`legacy-javascript`:** 13–14 KiB in react-dom on every page.
- **`render-blocking-insight`:** 3 CSS files (`0cn3cgh5w5rzl.css`, `0ytpex0n_nw9c.css`, `3odyh_j_4knxs.css`), estimated 60–340 ms.
- **`dom-size`:** `/` and `/tr` have 1,520 elements. `/how-it-works` has 918.
- **`uses-text-compression`:** `/guard` and `/tr/app` serve one 17 KiB `/api/rpc` response uncompressed (still open from the first measurement).
- **Accessibility:** `label-content-name-mismatch` (weight 0, so the score is still 100) on the `/how-it-works` contract links. Their aria-label doesn't contain the visible `0xdC2D…` text.

### Why mobile perf misses (and what would move it)

1. **Hydration cost, not download.** The JS is now small (190–282 KB gz), but the simulated 4× CPU still runs ~1.5–3 s of react-dom/Next boot and hydration before Lantern lets the LCP paint. `/` and `/tr` hydrate 1,520 DOM nodes, mostly the server-rendered shock scene and the below-the-fold takeover islands. Each island hydrates even though it is off-screen.
2. **Big HTML on the landing:** 79 KB gz (441 KB raw), up from 50.7 KB at `e00ef63`. The shock scene and the static takeover sections are all in the document. Parse HTML takes 0.9 s on the 4× CPU.
3. **Host variance:** the same page swung 59 ↔ 83. On a faster or steadier machine (benchmarkIndex ≥ 2,000), the guard/wallet/how pages would likely land in the high 70s to 80s, but not 90.

## 2. Initial JS (gzip)

**Method (a):** parse the served HTML. Take every `<script … src>` (deduplicated), excluding `noModule`; there are none in this build. Sum `gzip -9` of each matching file in `.next/static`.
**Method (b):** Playwright, mobile and desktop context. Sum the encoded body bytes (`request.sizes().responseBodySize`, gzip from `next start`) of `script` responses that finished before the `load` event. Also shown with response headers, and the scripts that load after `load` with no input (8 s idle on `/`, 5 s elsewhere). Mobile and desktop gave identical numbers.

| Page | (a) chunks | (a) gzip -9 | (b) before `load`, body | (b) with headers | After `load`, no input | HTML gz |
|---|---|---|---|---|---|---|
| `/` | 13 | **190.1 KB** | 190.9 KB | 207.0 KB | 3 scripts, 33.9 KB | 79.1 KB |
| `/tr` | 13 | 190.1 KB | 190.9 KB | 207.0 KB | 33.9 KB | 80.9 KB |
| `/app` | 20 | **282.1 KB** | 283.3 KB | 308.0 KB | 0.4 KB | 27.3 KB |
| `/tr/app` | 20 | 282.1 KB | 283.3 KB | 308.0 KB | 0.4 KB | 28.2 KB |
| `/guard` | 15 | **209.1 KB** | 210.0 KB | 228.5 KB | 10 scripts, 131.5 KB (viem reads after paint) | 12.5 KB |
| `/wallet` | 16 | **227.8 KB** | 229.1 KB | 248.8 KB | 9 scripts, 133.6 KB | 11.1 KB |
| `/how-it-works` | 13 | **185.4 KB** | 186.3 KB | 202.3 KB | 33.9 KB | 30.2 KB |

The earlier "190 vs 229 KB" disagreement for `/` is resolved: both methods now give 190–191 KB of body bytes. The ~207 KB figure counts HTTP response headers. ~229 KB matches `/wallet`, or `/` plus post-`load` chunks. Lighthouse's own network log for `/` agrees: 207.0 KB transferred for 13 scripts before load, and 244.6 KB including the 3 post-load scripts.

**Heavy libraries in `/`'s 13 initial chunks** (signature grep of each file; each signature was confirmed to match its library's lazy chunk):

| Library | Signature | In `/` initial? | Where it lives |
|---|---|---|---|
| three | `WebGLRenderer` | no | `3cdhrk_38kdkq.js` (lazy) |
| @react-three/fiber | `__r3f` | no | `3cdhrk_38kdkq.js` (lazy) |
| GSAP | `GreenSock` | no | `26z5y3xewknxi.js` (lazy; the landing no longer uses it) |
| Lenis | `lenis-smooth` | no | `3nrw97bwi-rf0.js` (fine pointer, after intent) |
| cmdk | `cmdk-root/-item` | no | `3tn89wh31x26r.js` (⌘K, on intent) |
| viem | `viem@`, `ContractFunctionExecutionError`, `HttpRequestError`, `secp256k1`… | no (not on any page's initial set) | 15 lazy chunks |
| Mera | `Authenticator did not return PRF output` | no | `0f27-p_tyj0ry.js` (lazy) |

Largest initial chunks on `/`: react-dom 69.8 KB, Next runtime 41.6 KB, motion-dom 17.0 + 9.5 KB, app/landing code 10.3 / 9.3 / 8.3 / 7.9 KB.

## 3. Comparison with the first measurement

| Metric | `e00ef63` (MEASUREMENTS.md) | Fix round 1 (plan) | **`25629a8` (this)** |
|---|---|---|---|
| `/` initial JS gz | 398.5 KB (23 chunks) | 206.9 KB | **190.1 KB (13)** |
| `/app` initial JS gz | 448.2 KB | 444 KB | **282.1 KB** |
| `/guard` / `/wallet` / `/how-it-works` | 366.2 / 381.7 / 335.6 KB | 315 / 343 / – | **209.1 / 227.8 / 185.4 KB** |
| `/` HTML gz | 50.7 KB | – | 79.1 KB (worse) |
| Mobile perf `/` | 44 (46/44/42) | 52–79 | **59 (47–67)** |
| Mobile perf `/app` | 41 | – | **56 (54–59)** |
| Mobile perf `/guard` / `/wallet` / `/how-it-works` | 61 / 75 / 81 | – | **68 / 59 / 60** (ranges up to 82 / 83 / 72) |
| Mobile LCP | 3.7–5.3 s | 2.8–4 s | **3.0–4.1 s** (medians) |
| Mobile TBT `/` | 22,040 ms | – | **2,535 ms** |
| Mobile TBT `/app` | 11,580 ms | – | **2,675 ms** |
| `/app` DOM | 1,745 | 906 | **715** |
| A11y / BP / SEO | 96–100 / 100 / 90 | 100 / 100 / 100 | **100 / 100 / 100** |
| CLS | ≤ 0.024 | 0 | **0 (desktop ≤ 0.007)** |
| Desktop `/` / `/app` | 62 / 98 | – | **96 / 97** |

On `/guard`, `/wallet` and `/how-it-works`, the mobile medians are lower than at `e00ef63` (75 → 59 on `/wallet`), even though their JS is ~40% smaller. The best runs here (82, 83, 72) match or beat the old ones. The first measurement had one run per page on a different, busier host, so a page-to-page regression can't be separated from host variance. The landing and console improved without doubt: TBT is ~9× and ~4× lower.

## 4. Correctness spot checks (production build; no transactions, no prove/run/borrow clicks)

- **Live numbers in the first HTML.** `/` server HTML: hero `$111.0M` stuck at −3% syrupUSDC (testnet block #67,124,048). Finding: `$133.9K ↔ $111.0M`, `829×` liquidity gap, 30 of 57 under the threshold, bad debt `$0`, exit pool `$7.0M`. The Kaskad result card repeats `$111.0M` / `$133.9K`. `/tr` shows the same values in Turkish format (`$111,0M`, `$133,9K`, `829×`). The `/app` server HTML has the default-preset result (`$0` bad debt, `$111.0M` can't be liquidated instantly, `$133.9K` liquidated, testnet block #67,124,278) and the book stats ($531.0M supplied, $238.8M debt, 255 borrowers). `/tr/app` matches.
- **OG images** (`/opengraph-image`, `/app/opengraph-image`, checked visually): STUCK DEBT `$111.0M`, CLEARED BY LIQUIDATORS `$133.9K`, GAP `829×`, real book 57 positions. These match both pages. The OG cards were rendered at build (block 67,117,046/037; 1 h revalidate) and the pages at ISR (10 min), so the block numbers differ while the figures are the same.
- **Landing wallet teaser vs `/wallet`:** the teaser shows the snapshot HF `1.024`, "liquidatable after a −2.30% drop", and says *"A snapshot, not the live position. The wallet page reads the live Aave position, so its numbers can differ."* `/wallet?address=0x815f…4748` (live, mainnet block #109,476,837) shows HF `1.022`, −2.20%. The first measurement's defect 7 is fixed by the label.
- **JS disabled `/` and `/tr` (390 px):** h1, hero metric, shock scene, finding, on-chain, monad, guard, wallet, how and footer are all present, visible (opacity 1) and filled with text (426–1,141 characters each). The on-chain result card is readable. Fixed from the first measurement's defect 2. Without JS, the shock panel's later-step captions stay at opacity 0 (it is `aria-hidden`/`inert`, a scroll-driven scene), which is expected.
- **Console:** 0 errors, 0 warnings and no HTTP ≥ 400 on `/`, `/tr`, `/app`, `/tr/app`, `/guard`, `/tr/guard`, `/wallet`, `/tr/cuzdan`, `/how-it-works` and `/tr/nasil-calisir` at 360 px. Also 0 errors on all 34 screenshot loads.
- **Horizontal scroll at 360:** 0 px on all 10 routes, both on the first screen and after scrolling to the bottom. 0 on all 6 widths × 5 pages + TR.

## 5. Screenshots

Same names and set as the first measurement, replaced in this folder (deviceScaleFactor 1, `isMobile` below 768):

- `{home,app,guard,wallet,how-it-works}-{360,390,768,1024,1440,1920}.png`. `wallet-*` uses `?address=0x815f5BB257e88b67216a344C7C83a3eA4EE74748`.
- `*-390-full.jpg` and `*-1440-full.jpg` (q70).
- `tr-{390,1440}.png`, `tr-app-{390,1440}.png`.
- `home-{390,1440}-scene-{1..4}.png`: shock scene mid-scroll at 25 / 45 / 65 / 85% of the track.

Landing shots waited 15 s and the others 5 s. The folder is ~11 MB (`pages-fixes/` untouched).

Capture note: the landing sections use `content-visibility: auto`, which Chromium's full-page capture leaves blank outside the viewport. `home-*-full.jpg` was therefore taken with a capture-only style `main section{content-visibility:visible}` after a full scroll. Viewport shots of each section confirm they render normally. The sticky shock scene still appears as ~2,000 px of dark space in the full-page JPEGs (a sticky-capture artifact, as before).

## 6. Visual defects (ranked)

Fixed since the first measurement: 360 hero under the header and readout over the CTA, the ghost on-chain card, the loop diagram over the dominoes (390 and 1440 scene shots are clean), the GasGauge chip wrap, the `/wallet` table at 390, the teaser vs wallet mismatch (now labelled), the WaveTimeline band, and the 768 empty grid cell.

**Medium**
1. **`/app` and `/tr/app` signer strip shows skeletons until the user interacts** (`app-390.png`, `app-768.png`, `tr-app-1440.png`). After 5 s with no input, the address, Balance and Sponsor budget are still grey skeleton bars. They fill in only after scroll or intent (`app-1440-full.jpg` shows `0.00 MON`, `3.98 MON`). On a phone the first screen ends on a loading state that never resolves by itself.
2. **Landing first screen at 390/360: ~180–220 px of empty space above the badge** (`home-390.png`: badge at y≈242; `tr-390.png`: y≈281). The hero is bottom-anchored, so the headline is pushed down and the second CTA ends at the fold. This is the old 768 problem moved to phones; 768 itself is now top-aligned and fine.
3. **Two block numbers for the same finding on the landing.** The hero keeps the server block (#67,124,048). After hydration, the finding and on-chain islands re-read and show a newer one (#67,126,418), and the nav shows the live head (#67,125,6xx). The figures are the same, but the hero and the cards look out of sync.
4. **English data note on the Turkish landing.** `/tr` "Bulgu" section: the exit-pool footnote is in English ("Sum of GeckoTerminal reserve_in_usd over 2 Monad DEX pool(s)… DefiLlama lists no non-lending (DEX) pool for it on Monad."). The data string has no Turkish variant.

**Low**
5. **Readout strip at page top says `BLOCK 06/20 · DROP −0.9%`** (1024/1440/1920 first screen) while the hint below says "Scroll to run the shock". The scene's starting frame looks like it is already mid-run.
6. **1024×768 hero:** the first (amber-rim) domino sits behind the "Is my position safe?" CTA (`home-1024.png`).
7. **1440 scene step 2:** every domino has an amber rim while the readout says `1/57` under the threshold (`home-1440-scene-2.png`). The colour reads as "most are at risk".
8. **`/app` Monte Carlo (1440):** with 0 bad-debt paths, ~200 px of empty chart sits above the dot row (`app-1440-full.jpg`). Still open from the first measurement.
9. Hero "Live preview · Monad testnet block #67,124,048" wraps onto two lines at 360/390.

## 7. Remaining recommendations (to reach mobile perf ≥ 90 / LCP < 2.5 s)

1. **Make below-the-fold landing islands hydrate only when near the viewport.** Mount the client component on IntersectionObserver over the static HTML, rather than hydrating all islands at load. Also trim the server-rendered shock scene's DOM, for example by rendering later steps on demand. Target `/` DOM < 800 and HTML < 50 KB gz. This attacks the 2.5 s TBT and the 3 s render delay on `/` and `/tr`.
2. **Defer the viem read chunk on `/guard`, `/wallet` and `/tr/app` until idle (`requestIdleCallback`), after the first interaction or with a longer delay.** Its 500–640 ms task lands inside the TBT window. Also gzip `/api/rpc` responses (17 KiB uncompressed).
3. **`/app`:** the document has 400–600 ms tasks at the start (style/layout 2.3 s). Put `content-visibility: auto` on the tabs/Monte Carlo/footer regions, and check whether the 715-node tree can render the positions grid lazily.
4. **Signer strip:** show resolved text such as "Temporary wallet · connect to see balance" instead of skeletons when the data is intent-gated (defect 1).
5. **Merge the 3 render-blocking CSS files**, or inline the critical part.
6. **Measure INP and scroll fps** with a Chrome DevTools trace on a real mid-range phone or a Vercel preview. Lighthouse lab numbers on this VPS swing by ±15 points, so confirm the final perf score on Vercel (HTTP/2, CDN, Brotli) before deciding more work is needed.
7. **Small fixes:** a Turkish `depthNote` (defect 4), one source of truth for the landing's block number (defect 3), top-aligned hero at < 768 (defect 2), and aria-labels on the `/how-it-works` contract links that contain the visible address.

## Method notes

- Scripts are in the session scratchpad (`final/`): `lh.sh` (load-gated Lighthouse runner), `sum.js`/`med.js`/`an.js` (tables and audits), `bundle-a.mjs`, `bundle-b.mjs`, `check.mjs` (JS-off, console, overflow), `shots.mjs`, `homefull.mjs`. Raw Lighthouse JSON is kept out of the repo because of its size.
- `/api/position` (paid mainnet RPC) was called only by the 6 `/wallet?address=` screenshot loads. The Lighthouse `/wallet` runs had no address.
- No transactions were sent and no MON was spent. `.env.local` was symlinked and never printed.
