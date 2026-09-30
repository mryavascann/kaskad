import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn (tailwind-merge with the design tokens)", () => {
  it("keeps a token font size and a token text color together", () => {
    expect(cn("text-liq-hi", "text-body-sm")).toBe("text-liq-hi text-body-sm");
    expect(cn("text-metric-xl", "text-warn")).toBe("text-metric-xl text-warn");
  });

  it("lets the later class win inside one group", () => {
    expect(cn("text-fg-2", "text-liq-hi")).toBe("text-liq-hi");
    expect(cn("text-title-1", "text-body")).toBe("text-body");
    expect(cn("rounded-control", "rounded-panel")).toBe("rounded-panel");
    expect(cn("shadow-panel", "shadow-glow-liq")).toBe("shadow-glow-liq");
    expect(cn("ease-out-expo", "ease-in-out-quart")).toBe("ease-in-out-quart");
    expect(cn("tracking-label", "tracking-caps")).toBe("tracking-caps");
  });

  it("treats the grid background as an image, not a background color", () => {
    expect(cn("bg-elev-1", "bg-grid")).toBe("bg-elev-1 bg-grid");
  });

  it("keeps the custom layout utilities", () => {
    expect(cn("page-shell", "grid-page", "label-mono", "section-y", "corner-ticks")).toBe(
      "page-shell grid-page label-mono section-y corner-ticks",
    );
  });
});
