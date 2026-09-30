import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { spring } from "@/motion/tokens";
import { Logo, LogoMark, springEasing } from "./logo";

const points = (easing: string) => easing.slice("linear(".length, -1).split(",").map(Number);

describe("LogoMark", () => {
  it('is an image named "Kaskad"', () => {
    render(<LogoMark />);
    expect(screen.getByRole("img", { name: "Kaskad" })).toBeInTheDocument();
  });

  it("can be decorative or renamed", () => {
    const { container, rerender } = render(<LogoMark decorative />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
    rerender(<LogoMark title="Kaskad home" />);
    expect(screen.getByRole("img", { name: "Kaskad home" })).toBeInTheDocument();
  });

  it("draws three blocks, the falling one in the liq token", () => {
    const { container } = render(<LogoMark size={32} />);
    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(3);
    expect(rects[0]).toHaveAttribute("fill", "currentColor");
    expect(rects[2]).toHaveClass("fill-liq");
    expect(container.querySelector("svg")).toHaveAttribute("width", "32");
  });

  it("tips further on hover only when animated, and only with motion allowed", () => {
    const { container, rerender } = render(<LogoMark />);
    const tip = () => container.querySelector("[data-slot='logo-tip']")!.getAttribute("class")!;
    expect(tip()).not.toContain("group-hover");
    rerender(<LogoMark animated />);
    expect(tip()).toContain("motion-safe:group-hover/logo:rotate-(--logo-tip-hover)");
  });
});

describe("Logo", () => {
  it('is announced once as "Kaskad", not as the lowercase wordmark', () => {
    render(<Logo />);
    const logo = screen.getByRole("img", { name: "Kaskad" });
    expect(logo).toHaveTextContent("kaskad");
    // The mark inside is decorative, so there is only one image.
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("scales the wordmark with the mark", () => {
    const { container } = render(<Logo size={28} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "28");
    expect(screen.getByText("kaskad")).toHaveStyle({ fontSize: "27px" });
  });
});

describe("springEasing", () => {
  it("samples the impact spring into a linear() easing that overshoots, then settles at 1", () => {
    const { easing, ms } = springEasing(spring.impact);
    const p = points(easing);
    expect(p[0]).toBe(0);
    expect(p.at(-1)).toBe(1);
    expect(Math.max(...p)).toBeGreaterThan(1.1);
    expect(ms).toBeGreaterThan(400);
    expect(ms).toBeLessThan(900);
  });

  it("does not overshoot a critically damped spring", () => {
    const critical = { type: "spring", stiffness: 100, damping: 20, mass: 1 } as const;
    const p = points(springEasing(critical).easing);
    expect(Math.max(...p)).toBeLessThanOrEqual(1);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThanOrEqual(p[i - 1]);
  });
});
