import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { radius, type } from "@/design/tokens";

// tailwind-merge only knows Tailwind's default scales. Without these, `text-body-sm` (a font size)
// is read as a text color and silently drops `text-liq-hi`, and `bg-grid` drops `bg-elev-1`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: Object.keys(type),
      radius: Object.keys(radius),
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
