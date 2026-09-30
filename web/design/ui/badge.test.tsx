import { render, screen } from "@testing-library/react";
import { Ban } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Badge, badgeStyles } from "./badge";
import { TONES } from "./tone";

describe("Badge", () => {
  it("shows the tone icon by default so the status never relies on color alone", () => {
    const { container } = render(<Badge tone="liq">Liquidation</Badge>);
    expect(screen.getByText("Liquidation")).toBeInTheDocument();
    const icon = container.querySelector("svg.lucide-octagon-alert");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("renders an icon for every tone", () => {
    for (const tone of TONES) {
      const { container, unmount } = render(<Badge tone={tone}>{tone}</Badge>);
      expect(container.querySelector("svg"), tone).not.toBeNull();
      unmount();
    }
  });

  it("drops the icon with icon={null} and accepts a custom one", () => {
    const { container, rerender } = render(<Badge icon={null}>ID 9</Badge>);
    expect(container.querySelector("svg")).toBeNull();
    rerender(
      <Badge tone="liq" icon={Ban}>
        Borrows paused
      </Badge>,
    );
    expect(container.querySelector("svg.lucide-ban")).not.toBeNull();
  });

  it("styles soft, outline and solid variants from tokens", () => {
    const { container, rerender } = render(<Badge tone="liq">x</Badge>);
    const badge = () => container.firstElementChild!;
    expect(badge()).toHaveClass("bg-liq/10", "text-liq-hi");
    rerender(
      <Badge tone="liq" variant="outline">
        x
      </Badge>,
    );
    expect(badge()).toHaveClass("bg-transparent", "border-liq/60");
    rerender(
      <Badge tone="liq" variant="solid">
        x
      </Badge>,
    );
    expect(badge()).toHaveClass("bg-liq", "text-bg");
    expect(badge()).toHaveAttribute("data-variant", "solid");
    expect(badge()).toHaveAttribute("data-tone", "liq");
  });

  it("uses the mono label style and sizes, and merges className last", () => {
    const { container } = render(
      <Badge mono size="sm" className="ml-2">
        Borrows paused
      </Badge>,
    );
    expect(container.firstElementChild).toHaveClass("label-mono", "h-5", "ml-2");
  });

  it("exposes its styles for badge-looking elements", () => {
    expect(badgeStyles({ tone: "safe", variant: "outline" })).toContain("text-safe");
  });
});
