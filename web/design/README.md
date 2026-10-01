# Kaskad design system

The "Instrument" language (stage 3 of `web/REDESIGN_PLAN.md`). Live reference: `/design` (hidden, `noindex`).

## Files

| Path | What |
|---|---|
| `design/tokens.css` | Source of truth: colors (oklch), type scale, radii, shadows, layout vars. Tailwind `@theme static`; the default Tailwind palette is reset, so only these colors exist. |
| `design/tokens.ts` | TS mirror (`color`, `hex`, `type`, `radius`, `layout`) for three.js / canvas / docs. `tokens.test.ts` fails on drift, gamut or contrast regressions. |
| `design/color.ts` | OKLCH ↔ sRGB, hex, WCAG contrast. |
| `design/base.css` | Element defaults + utilities: `page-shell`, `grid-page`, `section-y`, `label-mono`, `bg-grid`, `corner-ticks`. |
| `design/fonts.ts` | Geist (sans), Geist Mono (numbers, labels), Instrument Serif italic (accent). |
| `design/ui/*` | Base components (one family per file, kebab-case) + `*.test.tsx`. |
| `motion/*` | Motion tokens (`tokens.ts` / `tokens.css`) and primitives. |

## Tokens in Tailwind

- Surfaces `bg-bg`, `bg-elev-1..3`, `bg-void`. Lines `border-line`, `border-line-2`, `border-line-3`, `border-line-strong` (inputs).
- Text `text-fg-1..4` (fg-4: large text, disabled and non-text marks only).
- Status `calm`, `warn`, `liq`, `safe`, `monad` (+ `-hi` for small text). Tints via opacity: `bg-liq/10 border-liq/45`.
- Severity ramp for data: `sev-0..4`.
- Type: `text-display-xl`, `text-display`, `text-title-1..3`, `text-lead`, `text-body`, `text-body-sm`, `text-caption`,
  `text-label` (+ `label-mono`), `text-metric-xl|lg|md|sm` (always with `font-mono`).
- Radius `rounded-tag|control|panel|sheet`. Shadows `shadow-panel|pop|glow-liq|glow-warn|glow-safe|glow-monad`.
- Motion: `duration-(--dur-fast)`, `ease-out-expo|out-quart|in-out-quart|in-quart`, `animate-rise|fade-in|live|shimmer`,
  travel vars `--nudge|--rise|--enter` (0 under reduced motion).
- z-index: `z-(--z-nav|overlay|dialog|popover|toast)`.
- Always merge classes with `cn()` from `@/lib/utils` (it knows the custom scales; plain `twMerge` does not).

## Component rules

1. **API.** Function components, props typed from the DOM element (`ComponentProps<"button">` or `HTMLAttributes<HTMLElement>`
   for polymorphic `as`), `className` merged last with `cn()`. Variants with `cva`. Shared `tone` prop from `ui/tone.ts`
   (`neutral | calm | warn | liq | safe | monad`). React 19: `ref` is a normal prop, no `forwardRef`.
2. **Server first.** No `"use client"` unless the file needs state, effects, event handlers or a client-only library.
3. **No invented numbers.** Components never contain metric values. Missing data renders a skeleton, not `0` or `—`.
   On `/design`, sample metrics come from `DEPLOYMENT` (`@/lib/kaskad/config`) or obviously generic strings (`0123456789`).
4. **Copy is a prop.** Visible text and accessible names come from props; a11y fallbacks (e.g. `"Loading"`) are English
   defaults that callers can override (Turkish UI comes in stage 4).
5. **Never color alone.** Anything with a `tone` also shows an icon (`toneIcon`) or a word.
6. **Accessible by default.** Native elements first; Radix primitives for complex widgets. Visible focus (global
   `:focus-visible` ring in `monad-hi`), keyboard complete, names for icon-only buttons, `aria-live` for results,
   `aria-busy` for loading. Hit targets ≥ 24px (44px for primary touch actions).
7. **Motion.** Transform/opacity only, durations and easings from tokens, `motion-safe:` for anything looping,
   `motion-reduce:` fallbacks that keep the information. Interruptible (retarget, never restart).
8. **Tests.** Every component has `*.test.tsx` (jsdom project) that checks roles, names, states and keyboard behavior
   with Testing Library. No snapshot tests.
9. **No Slot across the server boundary.** `asChild` (Radix Slot) only inside client components. For links use
   `ButtonLink` (no Slot): children a Server Component passes to a client component can arrive as lazy
   references, and Slot then throws "Slot failed to slot onto its children" depending on tree position.
10. **Turkish casing.** `label-mono` is uppercase and follows `lang`: under `lang="tr"` an English "i" becomes "İ"
    ("MAİNNET", "BLİTZ"). Wrap English terms and brand names inside Turkish copy in `<span lang="en">`.
11. **Deterministic markup.** Round computed SVG geometry (e.g. to 2 decimals) before rendering: Node and the browser
   can disagree in the last bits of `Math.sin/cos/exp`, and the difference is a hydration mismatch. No `Date.now()`
   or unseeded `Math.random()` during render.

## Components (`design/ui`)

| Group | Files |
|---|---|
| Base | `button` (server-safe entry: `Button` from `button-client`, `ButtonArrow` from `button-arrow`, `buttonStyles`), `button-link` (`ButtonLink`), `label` (`Label`, `Eyebrow`), `panel` (`Panel`, `PanelHeader`, `PanelBody`), `tone` |
| Display | `badge`, `status-dot` (`StatusDot`, `LiveIndicator`), `honesty` (`HonestyTag`), `kbd`, `divider`, `logo` (`Logo`, `LogoMark`), `section-header` |
| Data | `metric` (`Metric`, `MetricGroup`, `formatMetric`), `readout` (`Readout`, `ReadoutRow`), `tick-ruler` |
| Feedback | `skeleton`, `callout`, `empty-state`, `steps`, `footnote`, `toaster` (`Toaster`, `notify`), `toaster-slot` (`ToasterSlot`, `requestToaster`) |
| Controls | `slider`, `segmented`, `tabs`, `switch`, `chip` (`Chip`, `ChipGroup`), `input` (`Input`, `InputAction`), `field` |
| Overlays | `tooltip` (`TooltipProvider`, `Tooltip`), `popover`, `term`, `dialog` (+ `ConfirmDialog`), `disclosure` |

Root providers (`shell/root-document.tsx`): `MotionProvider` (LazyMotion, features async), `ToasterSlot` (sonner loads when a page imports `toaster`), `DemoModeAttribute`, `RevealNoScript` (server). No root `TooltipProvider`: each `Tooltip` brings its own. Links: `ButtonLink` and the nav use `IntentLink` (prefetch on hover / focus / touch, not in view); the footer uses plain `next/link` with `prefetch={false}`.

Shell weight (every page carries it): `SiteNav` is a Server Component. Classes are merged with `cn` on the server and passed to the islands as final strings (`soundToggleClass`, the menu button), so no shell island imports tailwind-merge; the phone menu sheet (Radix Dialog), the ⌘K palette and the audio synth load on first use; the live block polls from the first idle period.

## Commands

`npm run typecheck`, `npm run lint`, `npm test` (unit + dom projects). Run one file: `npx vitest run design/ui/button.test.tsx`.
