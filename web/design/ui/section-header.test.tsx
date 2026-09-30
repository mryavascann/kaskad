import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionHeader } from "./section-header";

describe("SectionHeader", () => {
  it("renders an h2 headline with its serif accent, eyebrow and lead", () => {
    render(
      <SectionHeader
        index="02"
        kicker="How it works"
        title={
          <>
            One transaction. <em>Every</em> liquidation wave.
          </>
        }
        description="Kaskad replays a depeg across every real Aave borrower on Monad."
      />,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "One transaction. Every liquidation wave." });
    expect(heading.querySelector("em")).toHaveTextContent("Every");
    expect(heading).toHaveClass("text-display");
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByText("Kaskad replays a depeg across every real Aave borrower on Monad.")).toBeInTheDocument();
  });

  it("takes the heading level, size and id from props", () => {
    render(<SectionHeader as="h3" size="title" titleId="guard-title" title="Guard" />);
    const heading = screen.getByRole("heading", { level: 3, name: "Guard" });
    expect(heading).toHaveAttribute("id", "guard-title");
    expect(heading).toHaveClass("text-title-1");
  });

  it("renders actions and centers everything with align=center", () => {
    const { container } = render(<SectionHeader align="center" title="Guard" actions={<button type="button">Run the guard</button>} />);
    expect(screen.getByRole("button", { name: "Run the guard" })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("text-center");
  });

  it("skips the eyebrow when there is no index or kicker", () => {
    const { container } = render(<SectionHeader title="Plain" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});
