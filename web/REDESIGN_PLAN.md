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
3. **System (next):** tokens (oklch), type, grid, motion tokens (`web/motion/tokens.ts`), base components,
   hidden `/design` style page.
4. Pages in parallel: 3D hero (`web/three`), viz (`web/viz`), pages (`/`, `/app`, `/cuzdan`→`/wallet`,
   `/guard`, `/how-it-works`), chain wrappers (`web/lib/chain`). Old URLs keep working (redirects).
5. Polish: micro-interactions, loading/empty/error states, mobile, optional sound (off by default), `?demo=1`.
6. QA gate: Lighthouse (mobile perf ≥ 90, a11y/BP/SEO ≥ 95), LCP < 2.5s, CLS < 0.05, INP < 200ms,
   360/390/768/1024/1440/1920 screenshots, Playwright e2e (scenario → result → prove; address → HF;
   Guard: B rejects borrow), `rg` report of hardcoded numbers, `REDESIGN_REPORT.md`.

## Tooling

MCP servers added for this project (local scope): shadcn, magicui, context7, playwright, chrome-devtools,
vercel (needs OAuth via `/mcp`). 21st.dev skipped (needs a personal API key). Headless Chrome works for
static screenshots: use forward-slash paths and a separate `--user-data-dir` per run.
