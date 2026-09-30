import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

// Records the prefetch value next/link receives on each render.
const seen = vi.hoisted(() => [] as unknown[]);
vi.mock("next/link", () => ({
  default: ({ prefetch, href, ...props }: ComponentProps<"a"> & { prefetch?: unknown; href: string }) => {
    seen.push(prefetch);
    return <a href={href} data-prefetch={String(prefetch)} {...props} />;
  },
}));

const { IntentLink } = await import("./intent-link");
const { ButtonLink } = await import("./button-link");

describe("IntentLink", () => {
  it.each([
    ["pointer", (a: HTMLElement) => fireEvent.mouseEnter(a)],
    ["touch", (a: HTMLElement) => fireEvent.touchStart(a)],
    ["focus", (a: HTMLElement) => fireEvent.focus(a)],
  ])("does not prefetch until %s intent, then restores the default", (_name, intent) => {
    render(<IntentLink href="/app">Console</IntentLink>);
    const link = screen.getByRole("link", { name: "Console" });
    expect(link).toHaveAttribute("data-prefetch", "false");
    intent(link);
    expect(link).toHaveAttribute("data-prefetch", "null");
  });

  it("keeps the caller's handlers and an explicit prefetch", () => {
    const onMouseEnter = vi.fn();
    render(
      <IntentLink href="/guard" prefetch onMouseEnter={onMouseEnter}>
        Guard
      </IntentLink>,
    );
    const link = screen.getByRole("link", { name: "Guard" });
    expect(link).toHaveAttribute("data-prefetch", "true");
    fireEvent.mouseEnter(link);
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
    expect(link).toHaveAttribute("data-prefetch", "true");
  });

  it("ButtonLink prefetches on intent too", () => {
    render(<ButtonLink href="/wallet">Wallet</ButtonLink>);
    expect(screen.getByRole("link", { name: "Wallet" })).toHaveAttribute("data-prefetch", "false");
  });
});
