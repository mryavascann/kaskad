import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Kbd, KbdGroup } from "./kbd";

describe("Kbd", () => {
  it("renders a keyboard key", () => {
    render(<Kbd>G</Kbd>);
    expect(screen.getByText("G").tagName).toBe("KBD");
  });

  it("gives symbol keys a spoken name and hides the glyph from assistive tech", () => {
    const { container } = render(<Kbd label="Command">⌘</Kbd>);
    expect(screen.getByText("Command")).toHaveClass("sr-only");
    expect(screen.getByText("⌘")).toHaveAttribute("aria-hidden");
    expect(container.querySelector("kbd")).toHaveTextContent("⌘Command");
  });

  it("nests keys for a combination", () => {
    const { container } = render(
      <KbdGroup>
        <Kbd label="Command">⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>,
    );
    const group = container.firstElementChild!;
    expect(group.tagName).toBe("KBD");
    expect(group.querySelectorAll(":scope > kbd")).toHaveLength(2);
  });

  it("has two sizes", () => {
    render(
      <>
        <Kbd size="sm">A</Kbd>
        <Kbd>B</Kbd>
      </>,
    );
    expect(screen.getByText("A")).toHaveClass("h-5");
    expect(screen.getByText("B")).toHaveClass("h-6");
  });
});
