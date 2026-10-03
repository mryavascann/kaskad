# Kaskad · Metropolis frontend rebuild: report

Branch `feat/metropolis-frontend`. Status, decisions and history: `REDESIGN_PLAN.md`. Measurements:
`design-review/metropolis/MEASUREMENTS.md` (first pass), `design-review/metropolis/FINAL_MEASUREMENTS.md` (QA gate),
screenshots next to them.

## 1. Direction and why

Three directions were drafted (`design-review/directions/`: A · Instrument, B · Monolith, C · Epicenter); the
approved one is a **hybrid**:

- **Landing hero = B · Monolith.** A row of dark monoliths in the dark, **one per real borrower** of the syrupUSDC
  book, tipping over as the price falls (R3F, red rim light, Monad-purple haze). It is the one cinematic moment and
  it only replays the recorded on-chain result.
- **Everything else = A · Instrument.** "Seismograph × domino": a calm, precise instrument at rest that goes amber
  and red in waves when a shock runs through. Geist / Geist Mono (tabular numbers everywhere) with one Instrument
  Serif italic accent, oklch tokens, 1px lines, tick marks, coordinate labels, one hero metric per screen.
- **From C · Epicenter:** the rings/dots position view and the same-scale gap bars ("$134K vs $111M, ~829×").

Why: an international jury should read "funded risk-infrastructure product", not "hackathon demo". The instrument
language carries data density and seriousness (Bloomberg-like readability); the monolith hero gives the first
ten seconds their weight without inventing anything: every domino, its height, when it tips and its colour come from
`classifyPositions()`, an exact bigint replay that must match the on-chain preview field by field.

## 2. What was built

| Area | Where | Notes |
|---|---|---|
| Design system | `design/` | `tokens.css` (source) + `tokens.ts` mirror with drift / gamut / WCAG tests; 38 components in `design/ui` (Button, ButtonLink, IntentLink, Panel, Metric, Readout, TickRuler, HonestyTag, Segmented, Slider, Tabs, Dialog, Tooltip, Steps, …); hidden style page `/design` |
| Motion | `motion/` | Tokens (durations, easings, springs, stagger, beats), Reveal, Stagger, SplitText, Magnetic, Spotlight, demo mode (`?demo=1`, seeded randomness, large cursor), native scroll progress + intent gate, Lenis on fine pointers only, LazyMotion root |
| Chain layer | `lib/chain/` | Typed wrappers only (`lib/kaskad` unchanged): engine previews, scenarios/presets as data, narrative facts, guard, wallet, compare, limits, cost/confirm rule, typed tx events, lazy signer and actions, viem-free block number / balance reads, exact engine replay (`replay.ts`) |
| Charts | `viz/` | WaveTimeline (scrubber), PositionTiles, PositionRings, GapBars, StressCurve, MonteCarloChart, GasGauge, HealthDial, BlockPulse; SSR-identical markup, data tables, skeleton / empty / error in the same box |
| 3D | `three/` | HeroStage (SVG poster first, lazy R3F scene), capability + frame-budget fallbacks, poster on software GPUs, deferred on touch screens |
| Shell + i18n | `shell/`, `i18n/` | EN at the root, TR under `/tr` with Turkish slugs; nav with live block, ⌘K command menu (`command/`), sound toggle (off by default, `audio/`), footer with contracts; per-page dictionaries, TR `satisfies` EN |
| Pages | `views/` | Landing `/`, console `/app`, Guard `/guard`, wallet `/wallet` ("Is my position safe?"), methodology `/how-it-works`, each in EN and TR |
| Infra | `next.config.ts`, `og/`, `e2e/` | CSP + security headers, OG images per page and locale with live numbers (title-only fallback), redirects `/cuzdan` → `/tr/cuzdan`, `/baglan` → `/tr/app`, Playwright e2e with a no-transaction safety net |

### Pages

- **Landing.** Hero headline "One transaction. Every liquidation wave.", the live finding (debt that can't be
  liquidated instantly at −3% syrupUSDC) in the server HTML, WinnerBadge "Winner · Monad Blitz İstanbul v2", CTAs.
  A scroll-driven shock scene (block, oracle price, drop, waves, positions under threshold, liquidated; loop
  diagram), the finding as same-scale gap bars with the computed ratio and the model footnote, "why on-chain"
  (locked off-chain report → on-chain result), "why Monad" (gas gauge from the 10,000-position proof transaction,
  MIP-8 read cost 162.5 vs 2,100 gas from `limits.ts`, live block pulse), Guard and wallet teasers, architecture strip.
- **Console.** Preset cards (copy built from `presetFacts`), asset picker, shock slider + chips with a free live
  preview, oracle mode, advanced settings; result: hero metrics → position tiles → wave timeline with scrubber,
  "what happened?" narrative; "Prove on chain" with cost line, ≥ 1 MON confirmation and MonadScan link; tabs Monte
  Carlo / stress curve / two networks; signer strip (temporary wallet, browser wallet, Mera passkey, sponsor budget).
  The default scenario is read on the server (pinned block) so the first HTML has the real result.
- **Guard.** The live rule read from the contract, markets A and B, free pre-check that shows `BorrowIsPaused` on B,
  "run the Guard".
- **Wallet.** Address lookup (`?address=` shareable), health factor dial, liquidation threshold sentence, cascade
  outcome, stay-safe slider, deposit side.
- **How it works.** Methodology, assumptions, model limits, data source and snapshot, contracts, and a proof ledger
  that decodes the README proof transactions at build time.

### Animation list (each explains data or causality)

Headline SplitText; hero dominoes tipping by block (contact-solved, impact spring); shock-scene readout and loop
diagram tracking scroll; tiles flipping per wave and the scrubber replaying blocks; timeline draw-in with a pen on
the price path; gap bars growing context → hero → ratio; gas bars growing on a shared scale (Ethereum runs past its
cap); health-dial needle settling with a spring; block pulse at the observed block rate; Guard breaker lever; on-chain
unlock card. All are transform/opacity, interruptible, and static under reduced motion.

## 3. Honesty and correctness

- Every metric comes from the chain (`preview`, `previewCurve`, `previewMC`, proof receipts, contract views),
  `deployment.json` or a named constant with a source comment (e.g. the Gauntlet fee, 300 ms blocks). Missing data
  renders a skeleton of the same size, never `0` or a guess.
- Labels kept everywhere they apply: real book (Monad Aave, borrower count from `deployment.json`) vs synthetic
  (calibrated, scaled) book, oracle mode (realistic: follows the Maple rate / worst case: follows the pool), pool depth
  measured vs assumption with its note (in Turkish on `/tr`), arbitrage-recovery assumption, Ethereum data simulated
  on Monad, model footnote. The $116M pool-oracle figure is not used as a hook. None of the brief's forbidden phrases
  appear, and parallel execution is not presented as a Kaskad feature.
- Copy fixed from data: the old "USDC pool is hundreds of times the debt" is now the computed ratio (~23.5×); the
  root README's "~164 gas" is 162.5 (MIP-8 model).
- Verified on the production build: `/`, `/app` and the OG images show the same live figures ($111.0M stuck,
  $133.9K cleared, 829×); `scripts/hardcoded-numbers.sh` reports remaining literals (mostly geometry).
- Security: static CSP (0 violations on every route), HSTS in production, `Permissions-Policy` keeping passkeys,
  no `dangerouslySetInnerHTML`, `rel="noopener noreferrer"` on external links, addresses validated, nothing secret in
  `NEXT_PUBLIC_`, RPC polls ≥ 1 s and paused in hidden tabs, `/api/rpc` responses gzipped.

## 4. Performance and Lighthouse

### Production: PageSpeed Insights (after merge)

`kaskad42.vercel.app`, merge commit `7e890bb`, measured 2026-10-01 with PageSpeed Insights (Lighthouse 13.5.0,
emulated Moto G Power, slow 4G). Field data (CrUX) says "no data" yet: the site is too new.

| Page | Mobile perf | Desktop perf | A11y / BP / SEO | Mobile metrics |
|---|---|---|---|---|
| `/` | **95** | **99** | 100 / 100 / 100 | LCP above 2.5 s (amber; exact value not recorded) |
| `/app` | **96** | **100** | 100 / 100 / 100 | FCP 1.2 s, **LCP 2.6 s**, TBT 100 ms, CLS 0, SI 1.3 s |
| `/guard`, `/wallet`, `/how-it-works` | 98–100 | | | from the user's PSI runs (screenshots not archived) |

**Verdict:** mobile Performance ≥ 90, Accessibility / Best Practices / SEO ≥ 95 and CLS < 0.05 are met on every
measured page. **Lab LCP < 2.5 s is not met on `/app` (2.6 s) and `/`**, by about 0.1 s on `/app`.

Why the lab LCP sits above the observed one: on production the page paints once, at ~0.41 s, and that first paint
is the LCP (server-rendered text; FCP = LCP observed). By then the browser has already downloaded the page's JS (284 KB
on `/app`, 177 KB on `/`) and the four preloaded fonts (83 KB). Lighthouse's simulation (Lantern) charges every
request that finished before the observed LCP to the LCP on slow 4G, while its FCP model leaves the async scripts
out; hence FCP 1.2 s vs LCP 2.6 s on `/app`.

Tried and not adopted (A/B on production builds behind a 30 ms / 50 Mbps proxy, Lighthouse 13.5):
- `experimental.inlineCss`: +47 KB gz HTML per page (styles also repeat in the RSC payload); the first paint still
  came after all JS, so LCP didn't move (`/` 3.8–4.1 s vs 3.9–4.0 s on that host) and TBT got worse.
- No font preloads: the late font swap brought back layout shift on `/` (CLS 0.042–0.051, target < 0.05; 0 with the
  preloads) and the LCP change was inconsistent.

What would still move it: fewer bytes before the first paint, mainly JS (React/Next runtime plus page islands).

### Work server (before production)

Production build on the work server (`FINAL_MEASUREMENTS.md`, mobile median of 3, machine otherwise idle):

| Page | Perf | A11y / BP / SEO | LCP (lab) | TBT | CLS | Initial JS gz |
|---|---|---|---|---|---|---|
| `/` | 59 (47–67) | 100 / 100 / 100 | 3.6 s | 2.5 s | 0 | 190 KB |
| `/app` | 56 (54–59) | 100 / 100 / 100 | 4.1 s | 2.7 s | 0 | 282 KB |
| `/guard` | 68 (59–82) | 100 / 100 / 100 | 3.6 s | 1.1 s | 0 | 209 KB |
| `/wallet` | 59 (59–83) | 100 / 100 / 100 | 4.0 s | 2.6 s | 0 | 228 KB |
| `/how-it-works` | 60 (58–72) | 100 / 100 / 100 | 3.7 s | 2.3 s | 0 | 185 KB |

After that measurement the shell was cut (server-rendered nav with small client islands, phone menu sheet loaded on
first tap, audio engine on the sound toggle's click, `cn` without the token mirror, two render-blocking stylesheets
instead of three). Initial JS gz now: `/` 168 KB, `/how-it-works` 164 KB, `/guard` 205 KB, `/wallet` 212 KB, `/app`
269 KB. On `/how-it-works` (15 alternated loads at 4× CPU) script time fell 676 → 529 ms; Lighthouse on this host
moved 70 → 75 (median of 5) with overlapping ranges.

Desktop: `/` 96, `/app` 97, `/wallet` 97, `/how-it-works` 88, `/guard` 76. Observed (unthrottled) LCP 0.4–1.3 s,
LCP = FCP on every page (server-rendered text).

From the first measurement: landing initial JS 398.5 → 190 KB, landing TBT 22 s → 2.5 s, `/app` TBT 11.6 s → 2.7 s,
a11y 96 → 100, SEO 90 → 100, CLS ≤ 0.024 → 0.

These work-server numbers were far below production because Lighthouse's CPU benchmark on that VPS swung 895–1,807
between runs and a near-empty page scored only ~81 there (~66 inside the site shell); the shell cuts above were made
from that baseline before measuring production.

## 5. Tests

Typecheck and lint clean; Vitest unit + jsdom component tests (133 files / 925 tests at `d912717`); Playwright e2e
(desktop 1440 and mobile 390): Guard market B rejects the borrow, address → health factor, console scenario → result
→ prove (up to the send; the heavy proof's confirmation dialog), smoke (every route 200, one h1, no console errors,
no horizontal scroll at 360, redirects, 404), keyboard checks. A fixture fails any test that tries to send a raw
transaction, call `/api/fund` or reach an external RPC: no test spends MON. The real on-chain prove is a manual step.

## 6. Known limits

- Lab LCP on mobile is slightly above 2.5 s on `/` and `/app` (section 4). INP and scroll fps were not measured
  in the field.
- The default console preview and the landing finding are cached server reads (10 min ISR); a failed read keeps the
  last good page, and the build retries before publishing.
- Market B on testnet is already paused at 70 % max LTV; re-arming it needs the owner's reset script (costs MON).
- Locale copy for both languages ships in each page's bundle.
- Not used: Rive/Lottie, rapier physics, View Transitions, 21st.dev MCP (needs a personal key).

## 7. Credits used

Higgsfield: **0 credits** (not used; every visual is code-generated: R3F, SVG, CSS, `ImageResponse`).
