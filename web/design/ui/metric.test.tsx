import { render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { cssEasing, duration, easing } from "@/motion/tokens";
import { Metric, MetricGroup, MetricValue, formatMetric, isMetricValue } from "./metric";

// NumberFlow is loaded by Node as an external dependency, where esm-env reports "not a browser": its
// custom element is never defined and a re-render throws. Stub it at the import boundary with a
// recorder, so these tests check what Metric hands to NumberFlow (and survive updates).
const numberFlow = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock("@number-flow/react", () => ({
  default: (props: Record<string, unknown>) => {
    numberFlow.props.push(props);
    const { value, format, locales, prefix = "", suffix = "" } = props;
    const text = new Intl.NumberFormat(locales as Intl.LocalesArgument, format as Intl.NumberFormatOptions).format(value as number);
    return createElement("number-flow-react", { "aria-hidden": props["aria-hidden"] }, `${prefix}${text}${suffix}`);
  },
  NumberFlowGroup: ({ children }: { children: ReactNode }) => children,
}));

const usdCompact = { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

describe("formatMetric", () => {
  it("formats with en-US grouping by default", () => {
    expect(formatMetric(65813636)).toBe("65,813,636");
  });

  it("applies Intl options, e.g. compact USD", () => {
    expect(formatMetric(238833708.94, usdCompact)).toBe("$238.8M");
    expect(formatMetric(530962614.69, usdCompact)).toBe("$531.0M");
  });

  it("honours another locale", () => {
    expect(formatMetric(1234.5, { maximumFractionDigits: 1 }, "de-DE")).toBe("1.234,5");
  });

  it("adds prefix and suffix around the formatted number", () => {
    expect(formatMetric(829, { maximumFractionDigits: 0 }, "en-US", { prefix: "~", suffix: "×" })).toBe("~829×");
  });

  it("formats percentages and signs", () => {
    expect(formatMetric(-0.03, { style: "percent", maximumFractionDigits: 1, signDisplay: "always" })).toBe("-3%");
  });
});

describe("isMetricValue", () => {
  it("accepts finite numbers only", () => {
    expect(isMetricValue(0)).toBe(true);
    expect(isMetricValue(-12.5)).toBe(true);
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, "12"]) expect(isMetricValue(v)).toBe(false);
  });
});

describe("Metric", () => {
  it("gives screen readers the formatted value once and hides the rolling digits", () => {
    const { container } = render(<Metric label="Debt, all borrowers" value={238833708.94} format={usdCompact} />);
    expect(screen.getByText("Debt, all borrowers")).toBeInTheDocument();
    // Exactly one copy outside the hidden NumberFlow element.
    const spoken = screen.getAllByText("$238.8M").filter((el) => !el.closest("[aria-hidden='true']"));
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toHaveClass("sr-only");
    const flow = container.querySelector("number-flow-react");
    expect(flow).not.toBeNull();
    expect(flow).toHaveAttribute("aria-hidden", "true");
  });

  it("renders a same-size skeleton with aria-busy while the value is missing", () => {
    const { container } = render(<Metric label="Pool can clear" value={null} size="md" loadingLabel="Loading pool" />);
    const value = container.querySelector("[data-slot='metric-value']");
    expect(value).toHaveAttribute("aria-busy", "true");
    expect(value).toHaveClass("h-[1lh]", "text-metric-md");
    expect(screen.getByText("Loading pool")).toHaveClass("sr-only");
    const skeleton = container.querySelector("[data-slot='skeleton-metric']");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton).toHaveClass("text-metric-md");
    expect(container.querySelector("number-flow-react")).toBeNull();
  });

  it("treats undefined and NaN as missing, never as 0", () => {
    const { rerender } = render(<MetricValue value={undefined} />);
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByText("Loading")).toBeInTheDocument();
    rerender(<MetricValue value={Number.NaN} />);
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("is a polite atomic live region only when asked to announce", () => {
    const { container, rerender } = render(<Metric label="Bad debt" value={1} />);
    const root = container.querySelector("[data-slot='metric']")!;
    expect(root).not.toHaveAttribute("aria-live");
    rerender(<Metric label="Bad debt" value={null} announce />);
    expect(root).toHaveAttribute("aria-live", "polite");
    expect(root).toHaveAttribute("aria-atomic", "true");
    expect(root).toHaveAttribute("aria-busy", "true");
    rerender(<Metric label="Bad debt" value={2} announce />);
    expect(root).not.toHaveAttribute("aria-busy");
  });

  it("updates the spoken value when the number changes", () => {
    const { rerender } = render(<Metric label="Debt" value={1000} format={{ maximumFractionDigits: 0 }} />);
    expect(screen.getByText("1,000", { selector: ".sr-only" })).toBeInTheDocument();
    rerender(<Metric label="Debt" value={2500} format={{ maximumFractionDigits: 0 }} />);
    expect(screen.getByText("2,500", { selector: ".sr-only" })).toBeInTheDocument();
    expect(screen.queryByText("1,000", { selector: ".sr-only" })).toBeNull();
  });

  it("shows the tone icon next to the label (never color alone) and uses the tone color", () => {
    const { container } = render(<Metric label="Stuck debt" value={5} tone="warn" />);
    expect(container.querySelector("svg.lucide-triangle-alert")).not.toBeNull();
    expect(container.querySelector("[data-slot='metric-value']")).toHaveClass("text-warn");
  });

  it("uses the AA small-text tone color at size sm, and fg-1 for neutral numbers at any size", () => {
    const { container, rerender } = render(<Metric label="Gap" value={5} tone="liq" size="sm" />);
    const value = () => container.querySelector("[data-slot='metric-value']");
    expect(value()).toHaveClass("text-liq-hi", "text-metric-sm");
    rerender(<Metric label="Collateral" value={5} size="sm" />);
    expect(value()).toHaveClass("text-fg-1");
  });

  it("renders a tag beside the label and a caption", () => {
    render(<Metric label="Debt" value={1} tag={<span>Real book</span>} caption="255 borrowers" />);
    expect(screen.getByText("Real book")).toBeInTheDocument();
    expect(screen.getByText("255 borrowers")).toBeInTheDocument();
  });

  it("hands NumberFlow the value, format and motion-token timings", () => {
    numberFlow.props.length = 0;
    render(<MetricValue value={42} size="xl" format={{ maximumFractionDigits: 0 }} prefix="~" />);
    render(<MetricValue value={7} size="sm" />);
    const [hero, stat] = numberFlow.props;
    expect(hero).toMatchObject({ value: 42, locales: "en-US", prefix: "~", format: { maximumFractionDigits: 0 } });
    expect(hero.transformTiming).toEqual({ duration: duration.scene, easing: cssEasing(easing.outExpo) });
    expect(hero.spinTiming).toEqual(hero.transformTiming);
    expect(stat.transformTiming).toEqual({ duration: duration.slow, easing: cssEasing(easing.outExpo) });
    expect(stat.opacityTiming).toEqual({ duration: duration.base, easing: cssEasing(easing.outQuart) });
  });

  it("groups metrics without changing what they render", () => {
    render(
      <MetricGroup>
        <Metric label="A" value={1} />
        <Metric label="B" value={2} />
      </MetricGroup>,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
