import { render, screen } from "@testing-library/react";
import { BookOpen } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Footnote } from "./footnote";

const note = "Single Monad DEX pool, instant-sale (flash-loan) liquidator; Maple redemption and other venues excluded.";

describe("Footnote", () => {
  it("leads with a visible Model label and keeps the note on screen", () => {
    const { container } = render(<Footnote>{note}</Footnote>);
    expect(screen.getByText("Model")).toBeVisible();
    expect(screen.getByText(note)).toBeVisible();
    // Read as "Model: Single Monad DEX pool…"
    expect(container.firstElementChild).toHaveTextContent(`Model:${note}`);
  });

  it("takes another label, an icon and a different element", () => {
    const { container } = render(
      <Footnote as="figcaption" label="Real book" icon={BookOpen}>
        Monad Aave borrowers.
      </Footnote>,
    );
    expect(container.querySelector("figcaption")).not.toBeNull();
    expect(screen.getByText("Real book")).toBeInTheDocument();
    expect(container.querySelector("svg.lucide-book-open")).toHaveAttribute("aria-hidden", "true");
  });

  it("can drop the label", () => {
    const { container } = render(<Footnote label={null}>Plain note.</Footnote>);
    expect(container.firstElementChild).toHaveTextContent(/^Plain note\.$/);
  });
});
