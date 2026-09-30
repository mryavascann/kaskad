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
   - Machine has 16 GB RAM: at most 2 agents at a time, vitest `maxWorkers: 2`, screenshots run sequentially.
4. **Pages (next).** Old URLs keep working (redirects).
   - Routing: English at the root, Turkish under `/tr` with Turkish slugs. Route groups with their own root layouts
     (`app/(en)/layout.tsx` → `<html lang="en">`, `app/(tr)/tr/...` → `lang="tr"`); no proxy. Pages are thin files
     that render shared views with a `locale`. Dictionaries in `web/i18n/{en,tr}.ts` (typed). EN `/`, `/app`,
     `/wallet`, `/guard`, `/how-it-works`; TR `/tr`, `/tr/app`, `/tr/cuzdan`, `/tr/guard`, `/tr/nasil-calisir`.
     Redirects: `/cuzdan` → `/tr/cuzdan`, `/baglan` → `/tr/app` (signer lives in the console's top strip).
   - Order: (a) 3D hero (`web/three`) and viz (`web/viz`) agents in parallel while the orchestrator builds the shell
     (i18n, routing, nav, footer, live network strip); (b) two page agents: landing + how-it-works, console + wallet +
     guard. Legacy route group and its CSS are deleted when the new pages land.
   - Hero headline: "One transaction. Every liquidation wave." (the brief's suggestion; the live finding sits under it).
   - `web/lib/chain` is done (commit `9856c22`, see its README). Finding verified live at block 66,989,757:
     `stuckDebt` $110.99M, `totalLiquidated` $133.9K, ratio 828.9×, bad debt $0. `classifyPositions` gives
     per-position tiles only when its bigint replay matches the on-chain preview exactly (30 stuck / 27 safe).
   - Copy to fix while writing pages: the "USDC pool is hundreds of times the debt" line (data: ~23.5×) and the
     root README's "~164 gas" per read (model: 162.5). Derive both from data instead of repeating them.
   - English translations needed for the Turkish data strings `depthNote` and `RECOVERY_BPS[id].why` (key by asset id).
   - `presetFacts(id, now)`: pass a fixed `now` during SSR. Don't import from `hooks/*` in Server Components.
   - On-chain demo state: market B is already paused at 70% max LTV. Re-arming it needs the owner's reset script,
     which costs MON: ask the user first.
5. Polish: micro-interactions, loading/empty/error states, mobile, optional sound (off by default), `?demo=1`.
6. QA gate: Lighthouse (mobile perf ≥ 90, a11y/BP/SEO ≥ 95), LCP < 2.5s, CLS < 0.05, INP < 200ms,
   360/390/768/1024/1440/1920 screenshots, Playwright e2e (scenario → result → prove; address → HF;
   Guard: B rejects borrow), `rg` report of hardcoded numbers, `REDESIGN_REPORT.md`.

## Tooling

MCP servers added for this project (local scope): shadcn, magicui, context7, playwright, chrome-devtools,
vercel (needs OAuth via `/mcp`). 21st.dev skipped (needs a personal API key). Headless Chrome works for
static screenshots: use forward-slash paths and a separate `--user-data-dir` per run. It cannot go below ~500px
wide on Windows, so for phone widths use the Playwright CLI with the system Chrome (run sequentially):
`npx -y playwright@latest screenshot --channel chrome --viewport-size "390,844" --full-page <url> <file>`.
