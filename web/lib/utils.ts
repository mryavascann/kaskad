import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Names of the custom type and radius scales (`design/tokens.ts` `type` and `radius`). Literal copies,
 * not `Object.keys(...)` of the tokens: `cn` is in every page's client JS, and importing the token
 * mirror pulled the full color table (with its OKLCH → hex conversion) into it. `utils.test.ts` fails
 * when these drift from the tokens.
 */
export const TYPE_SCALE = [
  "display-xl", "display", "title-1", "title-2", "title-3", "lead", "body", "body-sm", "caption", "label",
  "metric-xl", "metric-lg", "metric-md", "metric-sm",
] as const;
export const RADIUS_SCALE = ["tag", "control", "panel", "sheet"] as const;

// tailwind-merge only knows Tailwind's default scales. Without these, `text-body-sm` (a font size)
// is read as a text color and silently drops `text-liq-hi`, and `bg-grid` drops `bg-elev-1`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...TYPE_SCALE],
      radius: [...RADIUS_SCALE],
      shadow: ["panel", "pop", "glow-liq", "glow-warn", "glow-safe", "glow-monad"],
      ease: ["out-expo", "out-quart", "in-out-quart", "in-quart"],
      animate: ["rise", "fade-in", "live", "shimmer"],
      container: ["page", "doc"],
      tracking: ["label", "caps"],
    },
    classGroups: {
      "bg-image": [{ bg: ["grid"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
