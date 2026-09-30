import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Magnetic } from "./magnetic";
import { MotionProvider, ReducedMotionScope } from "./provider";
import { mockMatchMedia } from "./test-utils";

const media = mockMatchMedia();

afterEach(() => act(() => media.set({ fine: true, reduce: false })));

/** A 100 × 40 box at the page origin (jsdom has no layout). */
function place(element: Element) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40, x: 0, y: 0, toJSON: () => ({}) });
}

function renderMagnetic(tree?: (node: React.ReactNode) => React.ReactNode) {
  const node = (
    <Magnetic strength={6} className="w-fit">
      <button type="button">Run the stress test</button>
    </Magnetic>
  );
  render(<MotionProvider>{tree ? tree(node) : node}</MotionProvider>);
  const button = screen.getByRole("button", { name: "Run the stress test" });
  const surface = button.closest("[data-magnetic]") as HTMLElement;
  const mover = button.parentElement as HTMLElement;
  place(surface);
  return { button, surface, mover };
}

const frames = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

describe("Magnetic", () => {
  it("keeps the child a normal, reachable control", async () => {
    const onClick = vi.fn();
    render(
      <Magnetic>
        <button type="button" onClick={onClick}>
          Prove on-chain
        </button>
      </Magnetic>,
    );
    const button = screen.getByRole("button", { name: "Prove on-chain" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("leans toward a mouse pointer, at most `strength` px, and springs back on leave", async () => {
    const { surface, mover } = renderMagnetic();
    expect(surface).toHaveAttribute("data-magnetic", "on");

    fireEvent.pointerMove(surface, { clientX: 100, clientY: 40, pointerType: "mouse" });
    await frames(400);
    const moved = mover.style.transform.match(/translateX\((-?[\d.]+)px\) translateY\((-?[\d.]+)px\)/);
    expect(moved).not.toBeNull();
    const [x, y] = [Number(moved![1]), Number(moved![2])];
    expect(x).toBeGreaterThan(3);
    expect(y).toBeGreaterThan(3);
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(6.01);

    fireEvent.pointerLeave(surface, { pointerType: "mouse" });
    await waitFor(() => expect(mover.style.transform).toBe("none"), { timeout: 2000 });
  });

  it("stays still on coarse (touch) pointers", async () => {
    act(() => media.set({ fine: false }));
    const { surface, mover } = renderMagnetic();
    expect(surface).toHaveAttribute("data-magnetic", "off");
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 40, pointerType: "mouse" });
    await frames(150);
    expect(mover.style.transform).toBe("none");
  });

  it("ignores touch input even on hybrid devices", async () => {
    const { surface, mover } = renderMagnetic();
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 40, pointerType: "touch" });
    await frames(150);
    expect(mover.style.transform).toBe("none");
  });

  it("stays still when the OS asks for reduced motion", async () => {
    act(() => media.set({ reduce: true }));
    const { surface, mover } = renderMagnetic();
    expect(surface).toHaveAttribute("data-magnetic", "off");
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 40, pointerType: "mouse" });
    await frames(150);
    expect(mover.style.transform).toBe("none");
  });

  it("stays still inside a forced reduced-motion scope", async () => {
    const { surface, mover } = renderMagnetic((node) => <ReducedMotionScope reduce>{node}</ReducedMotionScope>);
    expect(surface).toHaveAttribute("data-magnetic", "off");
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 40, pointerType: "mouse" });
    await frames(150);
    expect(mover.style.transform).toBe("none");
  });
});
