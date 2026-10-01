import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton, SkeletonMetric, SkeletonText } from "./skeleton";

describe("Skeleton", () => {
  it("is a decorative inline-safe span", () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const el = container.firstElementChild!;
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveClass("h-4", "w-32");
  });

  it("animates only when motion is allowed", () => {
    const { container } = render(<Skeleton />);
    const classes = container.firstElementChild!.className.split(" ");
    const animated = classes.filter((c) => c.includes("animate-") || c.includes("bg-linear"));
    expect(animated.length).toBeGreaterThan(0);
    for (const c of animated) expect(c.startsWith("motion-safe:")).toBe(true);
  });
});

describe("SkeletonText", () => {
  it("draws one line-height tall row per line, the last one shorter", () => {
    const { container } = render(<SkeletonText lines={3} className="text-body-sm" />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveClass("text-body-sm");
    const rows = [...root.children];
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toHaveClass("h-[1lh]");
    expect(rows[2].firstElementChild).toHaveClass("w-3/5");
    expect(rows[0].firstElementChild).toHaveClass("w-full");
  });

  it("keeps a single line full width", () => {
    const { container } = render(<SkeletonText lines={1} />);
    expect(container.firstElementChild!.firstElementChild!.firstElementChild).not.toHaveClass("w-3/5");
  });
});

describe("SkeletonMetric", () => {
  it("matches the metric type size and line box, with a width in characters", () => {
    const { container } = render(<SkeletonMetric size="xl" chars={7} />);
    const root = container.firstElementChild!;
    expect(root).toHaveClass("text-metric-xl", "h-[1lh]", "font-mono");
    expect((root.firstElementChild as HTMLElement).style.width).toBe("7ch");
  });
});
