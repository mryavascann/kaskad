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
| Scroll scenes (landing) | CSS sticky for pinning + `useScrollProgress` / `observeScrollProgress` (native scroll → MotionValue, started after `whenScrollIntent`); `SmoothScroll` (Lenis, fine pointer only) on the page that wants it. Parts that load after intent take over from static server HTML (see Scroll scenes). |

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
| `provider.tsx` (client) | `<MotionProvider>` (root: `LazyMotion` with `features.ts` = `domMax` loaded async, + `MotionConfig`), `<ReducedMotionScope reduce>` (previews, the /design switch). Use `m.*` (not `motion.*`) in shared components: `motion.*` carries the full feature bundle into that page's initial JS. |
| `reveal.tsx` (client) | `<Reveal as delay once amount>`, `<RevealNoScript />` (root layout). |
| `stagger.tsx` (client) | `<Stagger as gap delay trigger once amount>`, `<StaggerItem as>`. |
| `split-text.tsx` (server) | `<SplitText as text \| lines accent stagger delay>`. CSS in `split-text.module.css`. |
| `magnetic.tsx` (client) | `<Magnetic strength={6}>` around one control. |
| `spotlight.tsx` (client) | `<Spotlight as size={260} intensity={0.06}>`. |
| `scroll.ts` | `observeScrollProgress(el, { start, end }, onChange)` (native scroll, cached offsets, one read per frame; returns a stop function), `whenScrollIntent()` (resolves on the first scroll, wheel, touch, press, key or mouse move, or at once when the page opens scrolled / after a click in this document / on the server; no timer), `openScrollIntent()`, `resetScrollIntent()` (tests), `segment(p, from, to)` (a beat of a 0–1 progress), `scrollAt` / `edgeOffset` / `progressBetween` (range math). `loadScrollKit()` (GSAP + ScrollTrigger, one shared dynamic import) and `resetScrollKit()` are still exported for scenes that need GSAP timelines; the landing no longer uses GSAP. |
| `use-scroll-progress.ts` (client) | `useScrollProgress(ref, { start, end, initial = 0, reducedValue = 1, enabled, when })` → `MotionValue<number>`: the element's scroll progress from native scroll events (`observeScrollProgress`) without re-renders; `when` (e.g. `whenScrollIntent`) delays the observer. Reduced motion: no observer, jumps to `reducedValue` (the final state). |
| `smooth-scroll.tsx` (client) | `<SmoothScroll lerp={0.1} />`: Lenis (its own `autoRaf` loop, scrolling the window, so native scroll listeners follow it), loaded after `whenScrollIntent` and only with a fine pointer (phones never download it); mount it inside one page (the landing). Off under reduced motion. |

## Setup (root layout)

```tsx
<body>
  <RevealNoScript />
  <DemoModeAttribute />
  <MotionProvider>{children}</MotionProvider>
</body>
```

## Scroll scenes

Pin with CSS (`position: sticky` in a tall track), not with a scroll library's pin: the layout is final
at first paint, so nothing shifts when scripts arrive (CLS) and no-JS readers get a normal page. Drive
the scene from one progress value: `useScrollProgress(track, { when: whenScrollIntent })` (or
`observeScrollProgress` in a driver that renders nothing) → pass the MotionValue to three.js, write
`segment()` beats to CSS variables (no re-render per frame), and keep React state for discrete steps
only (e.g. the whole block number). Nothing of it runs until the reader's first intent; Lenis
(`SmoothScroll`) is a separate chunk requested after that intent, with a fine pointer only.

Parts whose code loads after intent are **takeover islands** (`views/landing/takeover.tsx`): the server
renders a static version (server components, no client code; the charts have `*Static` variants in
`viz/*-view.tsx` with the live chart's markup), a small eager wrapper shows it and swaps in the live
component after intent. Don't defer hydration with a `lazy` component behind a Suspense boundary that
waits on intent: React client-renders a dehydrated boundary with its fallback when a context above it
changes before it hydrates (the server HTML vanishes), and streamed content sits in hidden segments
that only a script reveals (no-JS readers and crawlers may never see it).

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
