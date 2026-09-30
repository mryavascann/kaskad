import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ButtonArrow } from "./button";
import { ButtonLink } from "./button-link";

describe("ButtonLink", () => {
  it("renders a link with button styles and no wrapper", () => {
    render(
      <ButtonLink href="/app" variant="primary" size="lg" className="w-full">
        Run the stress test <ButtonArrow />
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Run the stress test" });
    expect(link).toHaveAttribute("href", "/app");
    expect(link.className).toContain("bg-fg-1");
    expect(link.className).toContain("h-13");
    expect(link.className).toContain("w-full");
    expect(link.className).toContain("group/button");
  });

  it("uses the secondary variant by default", () => {
    render(<ButtonLink href="/guard">Guard</ButtonLink>);
    expect(screen.getByRole("link", { name: "Guard" }).className).toContain("border-line-3");
  });
});
