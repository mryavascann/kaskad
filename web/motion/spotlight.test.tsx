import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionProvider, ReducedMotionScope } from "./provider";
import { Spotlight } from "./spotlight";
import { mockMatchMedia } from "./test-utils";

const media = mockMatchMedia();

afterEach(() => act(() => media.set({ fine: true, reduce: false })));

function renderPanel(wrap?: (node: React.ReactNode) => React.ReactNode) {
  const node = (
    <Spotlight as="section" aria-label="Scenario" className="rounded-panel" size={200} intensity={0.08}>
      <p>Pool can clear</p>
    </Spotlight>
  );
  render(<MotionProvider>{wrap ? wrap(node) : node}</MotionProvider>);
  const panel = screen.getByRole("region", { name: "Scenario" });
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, width: 300, height: 200, right: 310, bottom: 220, x: 10, y: 20, toJSON: () => ({}) });
  return panel;
}

const glowOf = (panel: HTMLElement) => panel.querySelector<HTMLElement>("[data-spotlight-glow]");

describe("Spotlight", () => {
  it("renders the element with its children above a decorative glow", () => {
    const panel = renderPanel();
    expect(panel.tagName).toBe("SECTION");
    expect(panel).toHaveClass("rounded-panel", "isolate");
    expect(screen.getByText("Pool can clear")).toBeInTheDocument();
    const glow = glowOf(panel)!;
    expect(glow).toHaveAttribute("aria-hidden", "true");
    expect(glow).toHaveClass("pointer-events-none", "-z-10");
    expect(glow.style.background).toContain("200px circle at var(--mx, 50%) var(--my, 50%)");
    expect(glow.style.background).toContain("/ 0.08");
  });

  it("follows the pointer through CSS variables, once per frame, and fades out on leave", async () => {
    const panel = renderPanel();
    fireEvent.pointerEnter(panel, { clientX: 60, clientY: 70, pointerType: "mouse" });
    expect(panel).toHaveAttribute("data-spotlight", "on");
    expect(panel.style.getPropertyValue("--mx")).toBe("50px");
    expect(panel.style.getPropertyValue("--my")).toBe("50px");

    fireEvent.pointerMove(panel, { clientX: 110, clientY: 120, pointerType: "mouse" });
    fireEvent.pointerMove(panel, { clientX: 160, clientY: 170, pointerType: "mouse" });
    // Throttled: nothing is written until the next animation frame, then only the latest position.
    expect(panel.style.getPropertyValue("--mx")).toBe("50px");
    await waitFor(() => expect(panel.style.getPropertyValue("--mx")).toBe("150px"));
    expect(panel.style.getPropertyValue("--my")).toBe("150px");

    fireEvent.pointerLeave(panel, { pointerType: "mouse" });
    expect(panel).toHaveAttribute("data-spotlight", "off");
  });

  it("does nothing on touch screens", () => {
    act(() => media.set({ fine: false }));
    const panel = renderPanel();
    expect(glowOf(panel)).toBeNull();
    fireEvent.pointerEnter(panel, { clientX: 60, clientY: 70, pointerType: "touch" });
    expect(panel).not.toHaveAttribute("data-spotlight");
  });

  it("does nothing under reduced motion", () => {
    const panel = renderPanel((node) => <ReducedMotionScope reduce>{node}</ReducedMotionScope>);
    expect(glowOf(panel)).toBeNull();
    fireEvent.pointerEnter(panel, { clientX: 60, clientY: 70, pointerType: "mouse" });
    expect(panel).not.toHaveAttribute("data-spotlight");
    expect(panel.style.getPropertyValue("--mx")).toBe("");
  });
});
