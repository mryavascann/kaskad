# Kaskad motion

"Seismograph × domino": a calm, precise instrument at rest; a shock arrives and propagates in waves.
Live reference with demos: `/design#motion` (`/design?only=motion`).

## Rules

1. **Every animation explains data or causality** (wave → price drop → next wave). No decoration.
2. **Choreography:** context first, then the hero number, details last (`beat.context|hero|detail`).
   At most two heroes move at once.
3. **Transform and opacity only.** `will-change` only while a scene is active, never permanently.
4. **Reduced motion:** no travel, parallax or 3D; short fades stay; the information stays complete.
   `--nudge`, `--rise`, `--enter` collapse to `0px` (CSS), `MotionProvider` sets `reducedMotion="user"`
   (Motion), `motion-safe:` / `motion-reduce:` for Tailwind.
5. **Hover, press and focus on every clickable thing.** Magnetic pull and cursor glow only with a fine
   pointer (desktop), and subtle.
6. **Interruptible:** a new target retargets the running animation (springs, motion values); nothing
   restarts from zero.
7. **Demo mode** (`?demo=1`): deterministic playback, randomness seeded with `DEMO_SEED`, larger cursor.

## Which tool for which job

| Job | Tool |
|---|---|
| Above-the-fold entrance (hero copy, first metrics) | CSS `animate-rise` (+ `[animation-delay:…]`), `SplitText` for headlines. Plays at first paint, no hydration wait, protects LCP. |
| Below-the-fold entrance | `Reveal` (one block), `Stagger` + `StaggerItem` (lists, tile grids). In view, once. |
| Data that changes (numbers, gauges, bars) | Motion springs: `useSpring(value, spring.*)`, `animate(value, target, spring.*)`. Retargets with velocity. |
| Hover / press / focus | CSS transitions: `duration-(--dur-fast) ease-out-quart`. `Magnetic` / `Spotlight` for desktop pointers. |
| Loops (live dot, skeleton) | `motion-safe:animate-live`, `motion-safe:animate-shimmer`. |
| Canvas, WebGL, SVG plots | `ease.*` (`easing.ts`), `springStep` (`spring.ts`), seeded `mulberry32` (`random.ts`). |
| Scroll scenes (stage 4 landing) | GSAP + ScrollTrigger, reserved for scrubbed, pinned scenes. **Not installed yet.** |

## API

| Module | Exports |
|---|---|
| `tokens.ts` / `tokens.css` | `duration`, `easing`, `spring`, `stagger`, `beat`, `distance`, `transition`, `dampingRatio`, `toSeconds`, `cssEasing`; CSS `--dur-*`, `ease-*`, `--stagger-*`, `--beat-*`, `--nudge/--rise/--enter`, `animate-rise/fade-in/live/shimmer`. |
| `easing.ts` | `cubicBezier(x1, y1, x2, y2) → (t) => number`; `ease.outExpo(t)` … one per easing token; `clamp(v, min = 0, max = 1)`, `lerp(a, b, t)`, `mapRange(v, inMin, inMax, outMin, outMax, clamped?)`. |
| `spring.ts` | `springStep(spring, seconds)` (analytic step response 0 → 1), `springOvershoot`, `springPeakTime`, `springSettleTime(spring, tolerance = 0.02)`, `naturalFrequency`. |
| `random.ts` | `mulberry32(seed) → () => [0, 1)`, `randomBetween(rng, min, max)`, `pick(rng, items)`, `randomSeed()`, `DEMO_SEED`. |
| `demo.ts` | `isDemoMode(search?)`: pure, server-safe. |
| `demo-mode.ts` (client) | `useDemoMode()`, `<DemoModeAttribute />` (`<html data-demo="1">`), `useRandom()` (seeded with `DEMO_SEED` in demo mode). |
| `hooks.ts` (client) | `useFinePointer()`, `usePrefersReducedMotion()`, `useShouldReduceMotion()`, `useForcedReducedMotion()`. |
| `provider.tsx` (client) | `<MotionProvider>` (root), `<ReducedMotionScope reduce>` (previews, the /design switch). |
| `reveal.tsx` (client) | `<Reveal as delay once amount>`, `<RevealNoScript />` (root layout). |
| `stagger.tsx` (client) | `<Stagger as gap delay trigger once amount>`, `<StaggerItem as>`. |
| `split-text.tsx` (server) | `<SplitText as text \| lines accent stagger delay>`. CSS in `split-text.module.css`. |
| `magnetic.tsx` (client) | `<Magnetic strength={6}>` around one control. |
| `spotlight.tsx` (client) | `<Spotlight as size={260} intensity={0.06}>`. |

## Setup (root layout)

```tsx
<body>
  <RevealNoScript />
  <DemoModeAttribute />
  <MotionProvider>{children}</MotionProvider>
</body>
```

## Notes

- **Reduced motion in markup.** The server cannot know the OS setting, so markup never branches on
  `useShouldReduceMotion()` during the first render; it uses the CSS travel variables instead. Only a
  forced scope (`useForcedReducedMotion()`) may shape the first render.
- **No JavaScript.** `Reveal` and `StaggerItem` render hidden until they animate; `RevealNoScript`
  un-hides every `[data-reveal]` element. `SplitText` and `animate-rise` are pure CSS and need nothing.
- **`data-motion="reduced"`** on any ancestor switches CSS primitives (`SplitText`) to fades;
  `ReducedMotionScope` sets it together with the zeroed travel variables.
- **Tests.** `test-utils.ts` has a controllable `matchMedia` (reduced motion, fine pointer) and an
  `IntersectionObserver` double; install them at the top of a test file, before the first render.
