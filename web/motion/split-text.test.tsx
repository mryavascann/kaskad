import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SplitText } from "./split-text";
import styles from "./split-text.module.css";

const words = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(`.${styles.word}`)];

describe("SplitText", () => {
  it("keeps the sentence intact for assistive tech, search and copy", () => {
    render(<SplitText as="h1" text="One transaction. Every liquidation wave." />);
    const heading = screen.getByRole("heading", { level: 1, name: "One transaction. Every liquidation wave." });
    expect(heading).toHaveTextContent("One transaction. Every liquidation wave.");
    expect(heading).not.toHaveAttribute("aria-label");
  });

  it("wraps every word in a clipping mask and staggers the animation by index", () => {
    render(<SplitText as="h2" text="Liquidity gap per block" stagger={40} delay={100} />);
    const heading = screen.getByRole("heading", { level: 2 });
    const spans = words(heading);
    expect(spans.map((span) => span.textContent)).toEqual(["Liquidity", "gap", "per", "block"]);
    expect(spans.map((span) => span.style.animationDelay)).toEqual(["100ms", "140ms", "180ms", "220ms"]);
    for (const span of spans) expect(span.parentElement).toHaveClass(styles.mask);
  });

  it("uses the stagger token by default", () => {
    render(<SplitText as="p" text="Calm then alarm" />);
    expect(words(screen.getByText("alarm").closest("p")!).map((span) => span.style.animationDelay)).toEqual(["0ms", "40ms", "80ms"]);
  });

  it("renders explicit lines as blocks and counts words across lines", () => {
    render(<SplitText as="h1" lines={["One transaction.", "Every liquidation wave."]} accent={[2]} />);
    const heading = screen.getByRole("heading", { level: 1, name: "One transaction. Every liquidation wave." });
    const lines = [...heading.children];
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).toHaveClass("block");
    const spans = words(heading);
    expect(spans[2]).toHaveTextContent("Every");
    expect(spans[2].style.animationDelay).toBe("80ms");
  });

  it("sets accent words in the serif italic", () => {
    render(<SplitText as="h2" text="Cascade, measured." accent={[1]} />);
    const [first, second] = words(screen.getByRole("heading"));
    expect(second.parentElement).toHaveClass("font-serif", "italic", "text-fg-2");
    expect(first.parentElement).not.toHaveClass("font-serif");
  });

  it("passes id and className to the element", () => {
    render(<SplitText as="h2" id="hero-title" className="text-display" text="Kaskad" />);
    const heading = screen.getByRole("heading");
    expect(heading).toHaveAttribute("id", "hero-title");
    expect(heading).toHaveClass("text-display", styles.root);
  });
});
