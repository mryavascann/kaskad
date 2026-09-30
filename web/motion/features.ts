/**
 * Motion's feature bundle, loaded asynchronously by `MotionProvider` (`LazyMotion`), so the `m.*`
 * components in the shared root cost ~5 KB instead of the full `motion.*` bundle in every page's
 * initial JavaScript. `domMax` (animations, gestures, in-view, drag, layout / `layoutId`) because
 * Tabs and Segmented animate their indicator with `layoutId`.
 */
export { domMax as default } from "motion/react";
