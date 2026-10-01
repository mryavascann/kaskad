# Metropolis redesign: plan and status

Source brief: `KASKAD_METROPOLIS_FRONTEND_PROMPT.md` (in the user's scratch folder; summary below).
Branch: `feat/metropolis-frontend` (never commit to `main`; open a PR at the end).

## Decisions (approved by the user)

- **Direction: hybrid.** Landing hero = **B · Monolith** (R3F domino row, red rim light, cinematic).
  Everything else, including `/app`, = **A · Instrument** language (seismograph, tick marks, mono data,
  Geist / Geist Mono / Instrument Serif accent). From **C · Epicenter**: rings/dots position view in
  `/app` and the "$134K vs $111M, ~829×" same-scale gap bars for the landing "Finding" section.
  Drafts: `design-review/directions/*.html|png`.
- **Badge:** "Winner · Monad Blitz İstanbul v2" (1st place, confirmed by the user).
- **Higgsfield:** not used. All visuals free / code-generated (R3F, SVG, CSS, OG via `ImageResponse`).
- **Folder structure:** keep `web/app` routes; `web/lib/kaskad/*` must NOT move (scripts import it).
  New code under `web/design`, `web/motion`, `web/three`, `web/viz`, `web/lib/chain` (wrappers only).
- **Language:** English default, Turkish option (`/tr/...`).

## Hard rules (from the brief)

- Reuse the chain layer unchanged (see `ARCHITECTURE_INVENTORY.md`); new UI only calls it.
- No edits to `contracts/` or `.env*`; nothing secret in `NEXT_PUBLIC_`.
- No hardcoded metrics: every number from `preview`/chain; skeletons when missing.
- Keep honesty labels (synthetic book, real book = Monad Aave 255 borrowers, oracle modes, model footnote).
  Do not use the $116M "oracle follows the pool" figure as the hook.
- Forbidden: "128 KB contract", "megabytes of memory", parallel execution as a Kaskad feature.
- `npm run typecheck`, `npm run lint`, `npm test` green after every stage; add tests for new components.

## Stages

1. Discovery: done (`ARCHITECTURE_INVENTORY.md`, `design-review/before-metropolis/`).
2. Directions: done, approved (hybrid).
3. **System: done** (commits `a82c19d`, `aa437b6`, `332d119`, `0237396` + integration). 64 test files / 394 tests,
   typecheck and lint green; `/design` has no horizontal scroll at 360px and no hydration warnings.
   - `web/design/tokens.css` (source of truth, Tailwind `@theme static`, default palette reset) + `tokens.ts` mirror;
     `tokens.test.ts` checks drift, sRGB gamut and WCAG contrast (fg-1..3 and status text AA on every surface).
   - `web/motion/tokens.ts|css` (+ drift test); fonts in `web/design/fonts.ts`; rules in `web/design/README.md`.
   - `cn()` extended with the custom scales (plain tailwind-merge dropped `text-liq-hi` next to `text-body-sm`).
   - Legacy pages moved to the `app/(legacy)` route group (URLs unchanged) with their CSS in `app/(legacy)/legacy.css`;
     `app/globals.css` keeps only tokens + a small bridge for old class names. Delete both in stage 4.
   - Vitest projects: `*.test.ts` (node) and `*.test.tsx` (jsdom + Testing Library).
   - `/design` (noindex; `?only=<section>` renders one section): foundations, motion, display, data, feedback,
     controls, overlays. Root providers: MotionProvider, TooltipProvider, Toaster, DemoModeAttribute, RevealNoScript.
   - Working rule: at most 2 agents at a time with separate file ownership, vitest `maxWorkers: 2`, heavy commands
     (tsc, vitest, screenshots) one at a time, one dev server. Earlier sessions stopped on the token limit, not RAM:
     only run jobs in parallel that can finish within the session.
4. **Pages: in progress, about half done.** Old URLs keep working (redirects land with step 3 below).
   - **Done**
     - `03264c1` Shell. English at the root, Turkish under `/tr` with Turkish slugs; route groups with their own root
       layouts (`app/(en)/layout.tsx` → `<html lang="en">`, `app/(tr)/layout.tsx` → `lang="tr"`), no proxy. Pages are
       thin files that render shared views from `web/views/*` with a `locale`. `web/i18n/config.ts` (`ROUTES`, `href`,
       `switchLocalePath`, `languageAlternates`), `web/i18n/format.ts` (`formatters`, `usdParts` for NumberFlow),
       per-page dictionaries in `web/i18n/messages/*` (TR `satisfies` the EN shape; `data-notes.ts` has the English
       versions of the Turkish data strings `depthNote` and `RECOVERY_BPS[id].why`). `web/shell/*`: `RootDocument`,
       `SiteShell`, nav with the live network status (one `useLiveBlock` poll), locale switch, footer, `WinnerBadge`.
       `app/global-not-found.tsx` serves unmatched URLs. `ButtonLink` for link-buttons in Server Components.
     - `4f71a04` `/how-it-works`, `/tr/nasil-calisir`: methodology, data, assumptions, and a proof ledger that decodes
       the six README proof txs at build time (`lib/chain/proofs.ts`, `revalidate = 3600`).
     - `e25e5b3` `/guard`, `/tr/guard`: the rule read from the Guard contract with the live verdict, markets A/B,
       "try to borrow" (free pre-check shows the `BorrowIsPaused` revert on B) and "run the Guard". Shared tx UI in
       `views/shared/tx` (`useTxFlow`, `CostLine`, `TxProgress`, `useConfirmCost`).
     - `ac4250d` `/wallet`, `/tr/cuzdan`: position lookup (`?address=` is shareable), HealthDial, liquidation
       threshold, cascade outcome, stay-safe slider, deposit side.
     - `6a91791` `web/viz` (see its README; demos at `/design?only=viz`): WaveTimeline, PositionTiles,
       PositionRings, GapBars, StressCurve, MonteCarloChart, GasGauge, HealthDial, BlockPulse. Pages pass
       `formatUsd` from `formatters(locale)` so Turkish charts print `$111,0M` like the text (Intl default: `Mn`).
     - `5028aa9` `web/three` (see its README; demo at `/design?only=three`): HeroStage (poster first, lazy R3F
       scene, capability and frame-budget fallbacks), HeroPoster, HeroScene; `heroFromClassification` maps the
       finding's positions to dominoes. `@react-three/drei` was removed (unused).
     - State at handoff: typecheck and lint clean, 101 test files / 682 tests pass; every route answers 200 on
       the dev server (`/app`, `/tr`, `/tr/app` are still placeholders, `/` is still the legacy console).
   - **Next, in this order**
     1. Console `/app`, `/tr/app` (`views/console`, `i18n/messages/console.tsx`): preset cards (`PRESETS`,
        `presetFacts` with a fixed `now` during SSR), asset picker (`pickerAssets`), shock slider + chips with the
        free live preview (`usePreview`), oracle mode, advanced settings (`STEPS_RANGE`, `ROUNDS_RANGE`, real vs
        calibrated book). Result choreography: metrics → PositionTiles (`usePositionMap`) → WaveTimeline with a
        scrubber; `narrativeFacts` in both languages; "Prove on-chain" (`proveScenario` + `CostLine`, `TxProgress`,
        `useConfirmCost`) with a "1 tx · ms · positions" badge and MonadScan link. Tabs: Monte Carlo
        (`useMonteCarlo`, `proveMonteCarlo`), stress curve (`useStressCurve`), two networks (`useCompare`,
        `limitFacts`, GasGauge). Signer strip (`useSigner`, `useSignerBalances`, sponsor budget, `useSignerConnect`)
        and honesty labels (`assetFacts` + `data-notes`).
     2. Landing `/`, `/tr`: HeroStage (poster first) with the SplitText headline "One transaction. Every liquidation
        wave.", the live finding under it (`useFinding`), `WinnerBadge`, CTAs; a pinned GSAP ScrollTrigger shock scene
        (wave counter, loop diagram), GapBars finding, why on-chain, why Monad (GasGauge, MIP-8, BlockPulse), Guard
        and wallet teasers, architecture strip (`views/how/diagrams` Pipeline). Lenis off under reduced motion; keep
        the LCP on the poster.
     3. **Done** (`ea1f278`): `app/(legacy)`, `app/_components`, `components/*` and the `globals.css` bridge deleted;
        `/cuzdan` → `/tr/cuzdan`, `/baglan` → `/tr/app` (308, query kept); recharts, drei and
        `@react-three/postprocessing` removed (unused). Root README now says 162.5 gas per MIP-8 read (`99fb1af`).
   - Finding verified live at block 66,989,757: `stuckDebt` $110.99M, `totalLiquidated` $133.9K, ratio 828.9×, bad
     debt $0. `classifyPositions` gives per-position tiles only when its bigint replay matches the on-chain preview
     exactly (30 stuck / 27 safe).
   - Copy to fix while writing pages: the "USDC pool is hundreds of times the debt" line (data: ~23.5×) and the
     root README's "~164 gas" per read (model: 162.5). Derive both from data instead of repeating them.
   - Don't import from `lib/chain/hooks/*` in Server Components; server-safe helpers live in `lib/chain/events.ts`,
     `proofs.ts`, `protocol.ts`.
   - On-chain demo state: market B is already paused at 70% max LTV. Re-arming it needs the owner's reset script,
     which costs MON: ask the user first.
5. Polish: micro-interactions, loading/empty/error states, mobile, OG images (`opengraph-image.tsx` with live
   numbers), CSP and security headers in `next.config.ts`, `?demo=1` large cursor (`html[data-demo]`), ⌘K (`cmdk` is
   not installed yet), optional sound (off by default).
6. QA gate: Lighthouse (mobile perf ≥ 90, a11y/BP/SEO ≥ 95), LCP < 2.5s, CLS < 0.05, INP < 200ms,
   360/390/768/1024/1440/1920 screenshots, Playwright e2e (scenario → result → prove; address → HF;
   Guard: B rejects borrow), `rg` report of hardcoded numbers, `REDESIGN_REPORT.md`, PR and a Vercel preview.

## Session 2 (2026-09-30, server with 48 GB RAM)

- Handoff checks passed: `4a6dad7` on top, `npm ci`, typecheck, lint, 101 files / 682 tests, every route 200.
- The 2-agent cap was a 16 GB RAM limit; on this server up to 3 agents run in parallel with disjoint files:
  console (`views/console`, `messages/console.tsx`, `/app` pages), landing (`views/landing`, `messages/landing.tsx`,
  `/` and `/tr`, `motion/**`), polish (`next.config.ts` headers/CSP, `shell/**`, `messages/common.ts`, `design/**`,
  `command/` ⌘K, `audio/` sound off by default, `og/` + `opengraph-image.tsx`). The orchestrator owns this file.
- **Console done** (`3a5182c`, `d274525`, `09b29e4`, `008edcc`): `/app`, `/tr/app` in `views/console` (presets from
  `presetFacts`, live preview, metrics → tiles → timeline with scrubber, prove + cost + confirm, Monte Carlo / stress /
  two networks tabs, signer strip replacing `/baglan`, honesty labels, `?preset=` from ⌘K). USDC depth now from data.
- **E2E done** (`5881120`, `d149ef4`, `1eb34ab`): `npm run test:e2e` reuses the dev server (`E2E_START=1` builds);
  a safety fixture aborts any raw tx, `POST /api/fund` and external RPC. Guard B rejects, wallet HF, smoke (200, one
  h1, no errors, no 360 px scroll, redirects, 404), console up to the send, keyboard checks: 54 pass, 10 by-design
  skips. The real prove send stays a manual step (costs MON; ask first).
- `scripts/hardcoded-numbers.sh` (`c25a6ee`, `--summary`): rg report; the typed "3%" in meta/landing copy is now
  derived from the finding's scenario (`866f18f`, `8e9e4ea`).
- **Landing done** (`fc84e6f`, `41f6d59`, `72f1cee`, `866f18f`): hero (poster first, live finding in the server HTML,
  WinnerBadge, CTAs), sticky shock scene driven by ScrollTrigger (block/price/waves readout, loop diagram), GapBars
  finding + footnote, why on-chain unlock, why Monad (GasGauge from the 10k proof tx, MIP-8 162.5 vs 2,100 from
  `limits.ts`, BlockPulse), Guard and wallet teasers, Pipeline. Lenis + GSAP load after hydration; reduced motion is
  a static stack. Server data cached 10 min (`revalidate = 600`).
- **Stage 5 infrastructure done** (`9a80783` CSP + headers, `d9ea0e7` OG images, `717233f` demo cursor, `9f46f24` ⌘K,
  `8597a83` sound off by default, `8e9e4ea` description from data). Static CSP (`shell/security-headers.ts`): 0
  violations on all routes. OG cards live (finding, Guard rule) with title-only fallback.
- Checkpoint: typecheck + lint clean, 117 files / 778 unit tests, e2e 54 pass / 10 by-design skips.
- Wiring done (`24c3367` metadataBase + twitter/openGraph, `8fc0140`/`f69bd7b` sound cues, `ea44d28` mobile first
  screen, `971a034`, `d865daf` GasGauge tags).
- **Stage 6 measurement** (`e1f966a`, `design-review/metropolis/MEASUREMENTS.md`, prod build of `e00ef63`): a11y 96–100,
  BP 100, CLS ≤ 0.024, no horizontal scroll at 360–1920: pass. Fail: landing initial JS 398.5 KB gz (target ~250),
  mobile perf 41–81, LCP 3.7–5.3 s (JS weight), landing TBT 22 s (3D scene on software WebGL), SEO 90 (metadataBase,
  fixed since). Fix round running with three agents: core perf (3D poster on software GPUs, viem-free nav block poll,
  lazy motion/sonner, fonts, accessible names), landing (bundle, unlock card, loop diagram, 768/360 hero, teaser HF
  consistency, stale client data), pages (/app lazy tabs + DOM, heading order, /wallet table at 390, timeline band).

- **Fix round 1 done** (28 commits after `5522a57`). Initial JS gz: `/` 402.8 → 206.9 (target met), shared root
  339.5 → 185.6, `/guard` 315, `/wallet` 343, `/app` 444. 3D hero → poster on software WebGL and deferred on touch
  screens; viem-free nav block poll (`lib/chain/block-number.ts`); LazyMotion root; lazy sonner; intent prefetch
  (`design/ui/intent-link.tsx`); entrance animations fill `backwards` (fixed the timeline band); landing deferred
  sections; `/app` DOM 1,746 → 906, lazy tabs/tables; heading order; `/wallet` cards at 390; a11y 100, BP/SEO 100,
  CLS 0. Mobile perf still 52–79 on `/` (noisy machine), LCP 2.8–4 s. 855 unit tests, e2e 54/10.
- Git rule for parallel agents: commit with `git commit -m ... -- <paths>` (a shared index swept a staged deletion into
  `182bbf6`), own pid/scratch files, stop servers by PID only.

- **Perf rounds 2–3 done.** Landing: server-rendered shock scene, no GSAP, Lenis only on fine pointers after intent,
  intent gate (`whenScrollIntent`), LCP = FCP (`97128bf` … `ce680df`); below-the-fold sections use static-HTML
  takeover islands so they survive hydration and render without JS (`5993201`; the earlier Suspense deferral made
  them vanish); build-time retry of the landing read. Pages: lazy signer (`lib/chain/signer.ts`), lazy actions,
  viem reads after first paint, `viz` on `m.*` + lazy `animate` (`e8b3197`, `a72455e`, `b5a26ba`). Console: the
  default preset result is read on the server (`views/console/data.ts`, pinned block, revalidate 600) and
  `usePreview(scenario, initial)` doesn't refetch it; tabs/timeline/NumberFlow/prove flow/signer load on intent
  (`b630790`). Initial JS gz: `/app` 281, `/guard` 209, `/wallet` 228. Lesson: progressive hydration via Suspense
  loses server HTML when a context above changes (LazyMotion features load) — use takeover islands.
- Checkpoint `cab0720`: typecheck + lint clean, 131 files / 905 unit tests, e2e 54 / 10 skip. Final quiet-machine
  measurement → `design-review/metropolis/FINAL_MEASUREMENTS.md`; then `REDESIGN_REPORT.md` and the PR.

- Final QA gate `47961dc` (`FINAL_MEASUREMENTS.md`); last fixes `9bb1f34`, `2df10e9` (landing), `a641149` … `c8ec8b4`
  (pages, `/api/rpc` gzip); baseline: empty page ~81 without the shell, ~66 with it on this host. Shell cuts `0541d23`,
  `2b911a1`, `0f9e5e2`, `12b0f34`, `d912717`: initial JS `/` 168, `/how-it-works` 164, `/guard` 205, `/wallet` 212,
  `/app` 269 KB gz. `REDESIGN_REPORT.md` written. **PR #2** open (CI + Vercel green); the preview is behind Vercel
  SSO, so the user chose to measure PageSpeed on production after merge.

- **PR #2 merged** (`7e890bb`, 2026-10-01); production on `kaskad42.vercel.app`. PageSpeed Insights (user's runs):
  mobile perf `/` 95, `/app` 96, `/guard` `/wallet` `/how-it-works` 98–100; desktop `/` 99, `/app` 100; a11y/BP/SEO
  100; CLS 0. Open: lab LCP on mobile `/app` 2.6 s and `/` (amber) vs < 2.5 s. Inline CSS and dropping font preloads
  were A/B-tested and rejected (no LCP gain / CLS 0.05). Next lever: fewer JS bytes before the first paint.

## Handoff (2026-09-30)

The project moves to a server and continues in a new chat. What the new session needs that git doesn't carry:

- The brief `KASKAD_METROPOLIS_FRONTEND_PROMPT.md` lives outside the repo (Claude desktop scratch workspace
  `scratch-2026-09-24-434a54`). Copy it over or ask the user for it.
- `web/.env.local` (gitignored) holds the server keys `MONAD_TESTNET_RPC`, `MONAD_MAINNET_RPC`,
  `SPONSOR_PRIVATE_KEY`. Move it over a secure channel, never through a chat or a commit.
- The repo root has untracked `docs/` and `demo-work/` folders that are not part of this work; git won't carry them.
- Vercel MCP needs OAuth (`/mcp`) before a preview deploy.
- Check before starting: `git log --oneline main..HEAD`, then `npm ci`, `npm run typecheck`, `npm run lint`,
  `npm test` in `web/`.

## Tooling

MCP servers added for this project (local scope): shadcn, magicui, context7, playwright, chrome-devtools,
vercel (needs OAuth via `/mcp`). 21st.dev skipped (needs a personal API key). Headless Chrome works for
static screenshots: use forward-slash paths and a separate `--user-data-dir` per run. It cannot go below ~500px
wide on Windows, so for phone widths use the Playwright CLI with the system Chrome (run sequentially):
`npx -y playwright@latest screenshot --channel chrome --viewport-size "390,844" --full-page <url> <file>`.
