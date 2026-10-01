// The one static import of Motion's `animate` for the charts. Only viz/animate.ts imports this
// file, with import(), so the animation engine stays out of the pages' initial JavaScript.
export { animate } from "motion/react";
