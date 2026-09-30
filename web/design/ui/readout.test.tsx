import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Readout, ReadoutRow } from "./readout";

describe("Readout", () => {
  it("is a description list of term / value pairs", () => {
    render(
      <Readout>
        <ReadoutRow label="Pool can clear" value="$134K" />
        <ReadoutRow label="Source block" value="108,133,182" />
      </Readout>,
    );
    const terms = screen.getAllByRole("term");
    const values = screen.getAllByRole("definition");
    expect(terms.map((t) => t.textContent)).toEqual(["Pool can clear", "Source block"]);
    expect(values.map((v) => v.textContent)).toEqual(["$134K", "108,133,182"]);
  });

  it("pads rows for a panel by default and not when inset is off", () => {
    const { container, rerender } = render(
      <Readout>
        <ReadoutRow label="a" value="b" />
      </Readout>,
    );
    expect(container.querySelector("dl")).toHaveAttribute("data-inset", "true");
    rerender(
      <Readout inset={false}>
        <ReadoutRow label="a" value="b" />
      </Readout>,
    );
    expect(container.querySelector("dl")).toHaveAttribute("data-inset", "false");
  });

  it("shows a skeleton line, a loading label and aria-busy for a missing value, never 0", () => {
    render(
      <Readout>
        <ReadoutRow label="Liquidity gap" value={null} loadingLabel="Waiting for preview" />
      </Readout>,
    );
    const value = screen.getByRole("definition");
    expect(value).toHaveAttribute("aria-busy", "true");
    expect(within(value).getByText("Waiting for preview")).toHaveClass("sr-only");
    expect(value.querySelector("[data-slot='skeleton']")).toHaveAttribute("aria-hidden", "true");
    expect(value).not.toHaveTextContent("0");
  });

  it("opens external links in a new tab without leaking the opener, and says so", () => {
    render(
      <Readout>
        <ReadoutRow label="Engine" value="0xdC2D…b661" href="https://testnet.monadscan.com/address/0xdC2D" />
      </Readout>,
    );
    const link = screen.getByRole("link", { name: /0xdC2D…b661/ });
    expect(link).toHaveAttribute("href", "https://testnet.monadscan.com/address/0xdC2D");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleName("0xdC2D…b661, opens in a new tab");
  });

  it("colors the value by tone", () => {
    render(
      <Readout>
        <ReadoutRow label="Bad debt" value="$1" tone="liq" />
      </Readout>,
    );
    expect(screen.getByRole("definition")).toHaveClass("text-liq-hi");
  });

  it("renders the emphasis row with a metric-size value and a caption", () => {
    render(
      <Readout>
        <ReadoutRow emphasis label="Can't be liquidated instantly" value="$111.0M" caption="30 positions below threshold" tone="warn" />
      </Readout>,
    );
    const [value, caption] = screen.getAllByRole("definition");
    expect(value).toHaveTextContent("$111.0M");
    expect(value).toHaveClass("text-metric-lg", "text-warn");
    expect(caption).toHaveTextContent("30 positions below threshold");
  });

  it("uses a metric skeleton for a missing emphasis value", () => {
    render(
      <Readout>
        <ReadoutRow emphasis label="Bad debt" value={undefined} />
      </Readout>,
    );
    expect(screen.getByRole("definition").querySelector("[data-slot='skeleton-metric']")).not.toBeNull();
  });
});
