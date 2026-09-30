# Kaskad charts (`web/viz`)

The data visualizations of the "seismograph × domino" instrument: calm and precise at rest, amber and
red in waves when a shock runs through the book. Live reference with recorded data, loading, empty and
error states: `/design?only=viz`.

## Rules

1. **Data only.** Every mark is a number from a run (an on-chain `preview`, `previewCurve`, `previewMC`,
   or the exact bigint replay behind `classifyPositions`). Charts never smooth, fill in, jitter or add
   noise. A nonzero amount is never drawn thinner than 2.5 viewBox units / 1px, so an event cannot vanish.
2. **Same scale.** Bars that are compared share one linear scale (GapBars, GasGauge), even when one of
   them is a hairline.
3. **Never color alone.** Outcomes have a pattern (solid, hatch, cross-hatch, outline, level mark) and a
   legend icon; oracle modes have a dash, a marker shape and an icon; zones and statuses have a word.
4. **Same box in every state.** `null` data → skeleton in the plot's box (`aria-busy` + a text label),
   `error` → a `Callout` in the same box, empty data → an empty state that says what was checked.
5. **Readable without the chart.** `role="img"` + one summary sentence (or `figure` + `figcaption` when
   the values are already visible as text), and a `DataTable` (native `<details>`) with every value
   behind the charts that draw more than they label.
6. **Motion explains.** Draw-in, flips and springs follow the data, use `motion/tokens`, animate
   transform / opacity only, retarget instead of restarting, and are static under reduced motion.
   Components are `m.*` (features come from the root `LazyMotion`); imperative `animate` goes through
   `viz/animate.ts` (`withAnimate`, preloaded on mount), so the animation engine is not in the
   pages' initial JavaScript. `gap-bars` keeps the static import: its bars render full width, so a
   late start would flash them before they grow from 0.

## Components

One line per component; every prop list also takes `error?`, `errorAction?`, `locale?`, `copy?`,
`className?`, `id?` and the `format*` overrides named in the file.

| Component | API | Fed by (lib/chain) |
|---|---|---|
| `WaveTimeline` (client) | `timeline` (null = loading), `variant="console" \| "trace"`, `step?` + `onStepChange?` (playhead + scrubber), `entrance="replay" \| "reveal" \| "none"`, `table?`, `plotClassName?` | `cascadeTimeline(result, scenario)` → `{ points, stalled, lastActiveStep }` |
| `PositionTiles` (server-safe) | `classification` (null = loading, `consistent: false` = error), `step?` / `steps?` / `prices?` (replay), `weight="count" \| "debt"`, `expectedCount?` (skeleton tiles), `table?` | `classifyPositions(book, result, scenario)`; `prices` = `timeline.points.map(p => p.price)` |
| `PositionRings` (client) | `classification`, `shock` (fraction), `step?` / `steps?` / `prices?`, `centerLabel?`, `table?` | same as PositionTiles; `shock = scenario.shockBps / 10_000` |
| `GapBars` (client) | `cleared`, `stuck` (USD, null = loading), `footnote?` (slot) | `wadToNum(result.totalLiquidated)`, `wadToNum(result.stuckDebt)` (or `Finding.clearedUsd` / `stuckDebtUsd`) |
| `StressCurve` (client) | `data` (`curveFromChain(curve, shocksBps)`, null = loading), `marker?` (a shock to mark) | `useStressCurve()` → `{ curve: { pool, external }, shocksBps }` |
| `MonteCarloChart` (server-safe) | `facts` (null = loading) | `monteCarloFacts(result)` (`useMonteCarlo().facts`) |
| `GasGauge` (client) | `facts` (null = loading) | `limitFacts(result)` (Monad measured, Ethereum `gasEstimate` labelled as an estimate) |
| `HealthDial` (client) | `value` (HF; null = skeleton, `Infinity` = "no debt"), `target?` (default 1.05), `caption?` | `walletRisk().hf`, or `ClassifiedPosition.healthFactor` / `finalHealthFactor` |
| `BlockPulse` (client) | `block: bigint \| null`, `cells?` (default 40) | `useLiveBlock().block` (pass `error` when `useLiveBlock().error` is set) |

Shared pieces: `frame.tsx` (`StateBox`, `chartStatus`), `data-table.tsx` (`DataTable`), `outcome.tsx`
(`StateLegend`, `StateSwatch`, `STATE_FILL`, `STATE_ICON`), `use-enter-view.ts`, `viz.module.css`
(patterns, flip keyframes). Pure models (no React, server-safe, unit-tested): `format.ts`, `copy.ts`,
`geometry.ts`, `positions.ts`, `timeline-model.ts`, `curve-model.ts`, `monte-carlo-model.ts`,
`gauge-model.ts`, `rings-model.ts`.

Position states (`positions.ts`): at the end a tile shows its classification outcome (`bad-debt`,
`stuck`, `liquidated`, `safe`). During a replay it is `pending`, then `below` while the block's oracle
price is under its liquidation price (exact for untouched positions: their collateral does not move),
then `liquidated` from its `firstLiquidationStep`. Tiles are ordered closest to liquidation first
(`thresholdDrop`), and tiles that flip together fall one after another (`flipRanks`).

## SSR and responsive strategy

The markup is identical on the server and in the browser, and nothing is measured:

- **Cartesian charts** (timeline, stress curve, Monte Carlo) draw into a fixed viewBox (1000 × 300)
  stretched to a CSS-sized plot (`preserveAspectRatio="none"`, heights per breakpoint). Strokes keep
  their width with `vector-effect: non-scaling-stroke`; dots and markers are zero-length paths with
  round / square caps, so they stay circles and squares at any aspect. All text is HTML positioned in
  % (the `TickRuler` technique), so it never stretches, uses the type tokens and wraps like text.
- **Radial charts** (rings, dial) use a fixed aspect ratio (`aspect-square`, 240 / 136) and scale
  uniformly; their labels are HTML in % as well.
- **Bars** (gap bars, gas gauge, tiles, block strip) are HTML/CSS with widths in %.
- **Crowding** is solved with container queries computed from the data, not from measurements:
  axis labels thin out (`thinLabels`), a marker label hangs beside its line when the plot is wide
  enough and centres on it below that width (`markerLabel`), tags that cannot fit hide (`hideBelow`).
- **Rounding.** Every computed SVG number and CSS percentage goes through `round()` (2 decimals, 3–4
  for fractions) and angles are index-based (golden angle, with a dot-free lane at 12 o'clock for the
  ring labels): no `Math.random`, no hydration drift from `Math.sin/cos` last bits.

So there is no layout shift between the server render and hydration, and loading states keep the same
box. Charts are `min-w-0` and never wider than their container (checked at 390 and 1440 px).

## Motion

- `WaveTimeline` draw-in: one progress value reveals the plot left to right (a clip-path transform)
  while a needle rides the price path. `entrance="replay"` (default) renders the finished chart on the
  server and redraws it only if it scrolls into view after load; `entrance="reveal"` starts hidden and
  draws when in view (landing hero; visible without JavaScript through `RevealNoScript`); `"none"` is
  static. New data mid-draw keeps drawing (never restarts); bars retarget from their previous height
  (FLIP on `scaleY`, `spring.soft`); the price line cross-fades; the playhead glides (`spring.soft`).
- Tiles flip (CSS keyframes, keyed on the state, no JS); ring dots pop; the shock front expands on
  entry and follows the replay with `spring.soft`; gap bars grow context → hero → ratio (`beat.*`);
  gas bars grow at the same speed on the shared scale (Monad stops, Ethereum runs past its cap);
  the dial needle is `spring.needle` (trembles, settles, retargets; a value arriving after loading
  swings in from rest); the block strip ticks at the pace observed between polls.
- Reduced motion (OS setting or `ReducedMotionScope`): static draw, jumps instead of springs, fades
  instead of flips, no ticking. Entrances that would reset something already on screen never play:
  `useEnterView` only fires for charts that enter the view after the page loaded.

## Turkish (and other locales)

Everything a page needs to translate is serializable, so it can be passed from a Server Component:

```tsx
import { WAVE_TIMELINE_COPY } from "@/viz/wave-timeline"; // every key, English defaults
<WaveTimeline
  timeline={timeline}
  locale="tr-TR" // Intl formats: $1,1848 · %3,0 · 66.990.055 · compact $111,0 Mn
  copy={{ stalled: "Tasfiyeler {block}. blokta durdu: havuzda kârlı satış kalmadı", blockKey: "Blok", … }}
/>
```

- `copy` values are strings with `{placeholders}`, filled with already formatted values (`fill()`); the
  full key set and English defaults are exported per component (`WAVE_TIMELINE_COPY`, `POSITIONS_COPY`,
  `POSITION_RINGS_COPY`, `GAP_BARS_COPY`, `STRESS_CURVE_COPY`, `MONTE_CARLO_COPY`, `GAS_GAUGE_COPY`,
  `HEALTH_DIAL_COPY`, `BLOCK_PULSE_COPY`; state names in `STATE_COPY`). Copy avoids plurals ("Waves: 3").
- `locale` switches the default `Intl` formats (`vizFormats(locale)`).
- `format*` props (`formatUsd`, `formatPrice`, `formatPct`, `formatHf`, …) replace one format with a
  function, e.g. the legacy `fmtUsd` of `lib/kaskad/format`. Functions cannot cross the server → client
  boundary, so pass them from a client component (or wrap the chart in one).
- The site's pages write compact dollars as `$111.0M` / `$111,0M` (`formatters(locale)` in `@/i18n/format`),
  while the Intl default for `tr-TR` is `$111,0 Mn`. Pages pass `formatUsd` from `formatters(locale)` so
  charts and text agree.
- Charts that put labels on a surface other than `elev-1` can set `--viz-surface` on an ancestor (the
  label patches that keep lines off the text use it).

## Data, fixtures and tests

- `__fixtures__/viz-runs.json` (+ typed `load.ts`): a stress curve (syrupUSDC real book, both oracle
  modes), two Monte Carlo runs (external price, 100 paths; pool price, 30 paths — 100 did not fit in
  30M gas) and the 10,000-position calibrated preview, recorded from Monad testnet at block 66,999,532
  with `eth_blockNumber` + 6 `eth_call`s (free, no transaction, 0 MON). The note in the file lists every
  call. `__fixtures__/data.ts` derives chart inputs from these and `lib/chain/__fixtures__`.
- `/design` labels every demo "Recorded preview, block N". `BlockPulse` there reads the live block.
- Tests: `npx vitest run viz` (unit: formats, geometry, positions, models against the recorded runs;
  jsdom: roles, summaries, states, step syncing, keyboard, reduced motion, copy/format overrides).
