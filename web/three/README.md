# web/three: the landing hero scene

Direction "B · Monolith": a row of dark monoliths in the dark, **one per real borrower** of the book,
that tips over as the price falls. Thin red rim light, faint Monad-purple haze, a floor grid fading
into the dark. The animation only replays the recorded result: outcomes come from
`classifyPositions()`, never from here. Live reference: `/design#three` (`/design?only=three`).

## Files

| File | What | Runs on |
|---|---|---|
| `hero-stage.tsx` | `HeroStage`: poster first, WebGL scene when capable, cross-fade. **Use this.** | client |
| `hero-scene.tsx` | `HeroScene`: the R3F canvas. Only ever loaded through `next/dynamic` (`ssr: false`). | client, lazy chunk |
| `hero-poster.tsx` (+ `.module.css`) | `HeroPoster`: the same frame as SVG (no WebGL, no three.js). | server or client |
| `data.ts` | `heroFromClassification`, `blockAt`, `progressAtBlock`, `dropAt`: chain data → positions + timeline. | anywhere |
| `model.ts` | `buildHeroModel`, `poseAt`, `heightFor`, contact solver, `TIMING`, `DOMINO`. | anywhere |
| `palette.ts` | state → edge color / intensity / floor pool, from `design/tokens.ts` `hex`. | anywhere |
| `stage.ts` | camera framings (wide / tall), `frameCrop`, projection, fog, backdrop gradients. | anywhere |
| `poster-geometry.ts` | the posed model projected to SVG paths (painter's order, rounded to 0.1). | anywhere |
| `capability.ts` | `chooseHeroMode(env, preference)` (pure) and `readHeroEnv()` (client). | anywhere / client |
| `frame-budget.ts` | `FrameBudget` frame-time guard, `QUALITY_LEVELS`. | anywhere |
| `progress.ts` | `ProgressSource` = `number \| MotionValue<number>`. | anywhere |
| `scene/materials.ts`, `scene/environment.ts` | shaders (slabs, backdrop, floor, pools) and the procedural PMREM environment. | lazy chunk |

## Usage (landing)

Compute the data on the server (the finding is a free `eth_call`; cache it) and pass plain props:

```tsx
// Server
const finding = await fetchFinding();
const classification = await fetchFindingPositions(finding);
const hero = classification.consistent
  ? heroFromClassification(classification.positions, finding.scenario, { result: finding.result })
  : null; // no per-position data: the stage shows the neutral row
```

```tsx
// Client: drive progress from scroll without React re-renders (GSAP ScrollTrigger → MotionValue)
"use client";
const progress = useMotionValue(0);
useEffect(() => {
  const trigger = ScrollTrigger.create({
    trigger: sectionRef.current, start: "top top", end: "+=160%", pin: true, scrub: true,
    onUpdate: (self) => progress.set(self.progress),
  });
  return () => trigger.kill();
}, [progress]);

<HeroStage
  className="absolute inset-0"            // the stage fills the box it is given; it never sizes itself
  positions={hero?.positions}             // absent → neutral loading row, nothing encoded
  progress={progress}                     // number or MotionValue, 0 → 1
  placeholderCount={DEPLOYMENT.assets[9].realPositions} // real book size for the loading row
/>
```

Keep the readout in sync with the same mapping: `blockAt(hero.timeline, p)` (continuous block, clamped
to `steps`), `dropAt(hero.timeline, p)` (drop of the straight-line path in whole blocks, `0.03` = −3 %),
price = `startPrice × (1 − drop)` for the external oracle. With the default `start: "first-tip"` the
timeline starts half a block before the first tip, so **the first domino tips with the first scroll**;
for the finding that is block 7 (the one liquidation), then a pause until blocks 14–20 while the price
keeps falling. Pass `{ start: "shock" }` to start at block 0 instead.

Reduced motion: the stage keeps the poster at `posterProgress` (default `1`: the final state, every
outcome visible). Don't scrub a poster from scroll. Demo mode (`?demo=1`): the stage pins `quality="high"`,
and frames are a pure function of progress, so recordings are identical.

## Props

**`HeroStage`** `{ positions?, progress? = 0, placeholderCount?, mode? = "auto" | "scene" | "poster",
quality?, parallax?, posterProgress? = 1, onModeChange?(decision), onReady?(), onStats?(stats), className? }`.
Root carries `data-mode` (`pending | scene | poster`), `data-reason` and `data-ready` (canvas visible).

**`HeroScene`** (lazy) `{ positions?, progress? = 0, placeholderCount?, quality? = "auto" | "high" | "medium" | "low",
parallax? = true, onReady?, onStats?, onContextLost?, className? }`. `auto` adapts to the frame budget;
a named level is pinned. Parallax only with a fine pointer and without reduced motion.

**`HeroPoster`** (server-safe) `{ positions?, progress? = 1, placeholderCount?, className? }`.

**`HeroPosition`** `{ order, debtUsd, outcome, tipAt?, hitAt?, thresholdAt? }` (progress units; see `model.ts`).

## Data → scene

| Scene | Data |
|---|---|
| One domino | One position of `classifyPositions()` (consistent replay of the on-chain preview). No data: `placeholderCount` neutral, upright dominoes. |
| Row order | Distance to liquidation: `thresholdDrop` ascending (`null` = never, last). |
| Height | `debtUsd`, log-compressed over 4 decades: `heightFor(debt, maxDebt)` ∈ [0.45, 1]. |
| When it tips | The block where the price first sits below its liquidation price (logged oracle prices when a `result` is passed, straight-line path otherwise; bounded by `firstLiquidationStep`, then made monotone along the row). Same-block tips stagger 0.16 block (≤ 0.8 block per block). |
| Stuck (amber `warn`) | Tips and freezes at `STUCK_LEAN` (24°) or earlier on the next domino: can't be liquidated instantly. |
| Liquidated / bad debt (red `liq`) | Falls until it rests on the next dominoes (chain angle ≈ 46° with these proportions); bad debt glows hotter and tints its faces. |
| Partly liquidated | Red flash in the block of its first liquidation (`hitAt`), then amber with a red foot. |
| Safe (dark) | Never moves; its hairline warms toward amber over `TIMING.warmWindow` before its liquidation price. |
| Floor light | Hot edges spill a pool of their color on the floor (`poolOf`). |

Motion: a falling domino rotates about its front-bottom edge with `ease.inQuart` and lands with the
`impact` spring (`landingBounce`, from `springStep`); contact is solved geometrically (2D separating
axes), so slabs never interpenetrate. `poseAt(model, progress)` is pure and deterministic.

## Poster ↔ canvas

Both project the same model through the same camera (`stage.ts`). The frame covers its container like
`object-fit: cover`; `frameCrop()` gives the crop, applied with `camera.setViewOffset` in WebGL and with
container-query units in `hero-poster.module.css`. Containers narrower than 1:1 switch to the tall
framing (9:16) in both. Backdrop gradients are composited in sRGB in both, so the cross-fade does not jump.
Poster coordinates are rounded to 0.1 (design rule 9); gradient ids come from `useId`.

## Performance guards

- **Lazy chunk**: three (core + module), `@react-three/fiber`, `postprocessing`, `RoundedBoxGeometry`,
  `hero-scene.tsx`, `scene/*`. Requested only after `load`, after the first paint, on idle
  (`requestIdleCallback`, ≤ 1.2 s) and when the stage is within half a screen of the viewport. drei is
  not used. The client chunk of `HeroStage` holds only the poster math and the stage logic.
- **Poster first**: the server renders the poster; the client decides after the first paint.
- **Poster only** (`chooseHeroMode`): reduced motion, no WebGL 2, software renderer
  (`failIfMajorPerformanceCaveat`), ≤ 2 cores, ≤ 2 GB (`deviceMemory`), `saveData`. Context loss or a
  scene error falls back to the poster (`scene-failed`).
- **On demand**: `frameloop="demand"`; frames only on progress / pointer / size / quality changes.
  `compileAsync` before the first frame; `onReady` after it is on screen.
- **Frame budget** (`FrameBudget`, not drei's FPS monitor, which reads idle time as slowness in demand
  mode): runs of consecutive frames (gaps > 250 ms end a run) with a median interval above
  max(20 ms, 1.5 × refresh) step down one level: high (DPR ≤ 1.75, bloom, MSAA 4) → medium (DPR ≤ 1.25,
  bloom) → low (DPR 1, no composer). At most one step back up.
- **Paused** off screen (IntersectionObserver) and in hidden tabs (`frameloop="never"`).
- **Disposal**: geometries, materials, the environment map, the composer and the renderer (R3F) on unmount.

## Testing

`npx vitest run three`: model (height scale, tip angle vs progress, fall order, no interpenetration,
landing spring), data (the recorded syrupUSDC −3 % and pool-spiral previews), palette (state → color
from `hex`), stage (crop, projection), capability, frame budget, poster geometry and DOM, stage (mocked
scene). Headless Chrome may render WebGL in software; allow ~5–20 s before a screenshot.
