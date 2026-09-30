import { act, render, renderHook, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { DemoModeAttribute, useDemoMode, useRandom } from "./demo-mode";
import { DEMO_SEED, mulberry32 } from "./random";

/** Changes the address bar like a back/forward navigation would. */
function navigate(search: string) {
  act(() => {
    window.history.pushState({}, "", `/${search}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

afterEach(() => navigate(""));

function Status() {
  return <p>{useDemoMode() ? "demo on" : "demo off"}</p>;
}

describe("useDemoMode", () => {
  it("reads ?demo=1 from the address bar and follows history navigation", () => {
    render(<Status />);
    expect(screen.getByText("demo off")).toBeInTheDocument();
    navigate("?demo=1");
    expect(screen.getByText("demo on")).toBeInTheDocument();
    navigate("?demo=0");
    expect(screen.getByText("demo off")).toBeInTheDocument();
  });

  it("is off on the server (no hydration mismatch)", () => {
    window.history.pushState({}, "", "/?demo=1");
    expect(renderToString(<Status />)).toContain("demo off");
  });
});

describe("DemoModeAttribute", () => {
  it("mirrors demo mode as <html data-demo='1'> and removes it again", () => {
    const { container, unmount } = render(<DemoModeAttribute />);
    expect(container).toBeEmptyDOMElement();
    expect(document.documentElement).not.toHaveAttribute("data-demo");
    navigate("?demo=1");
    expect(document.documentElement).toHaveAttribute("data-demo", "1");
    navigate("");
    expect(document.documentElement).not.toHaveAttribute("data-demo");
    navigate("?demo=1");
    unmount();
    expect(document.documentElement).not.toHaveAttribute("data-demo");
  });
});

describe("useRandom", () => {
  it("replays the DEMO_SEED sequence in demo mode", () => {
    navigate("?demo=1");
    const reference = mulberry32(DEMO_SEED);
    const expected = [reference(), reference(), reference()];
    const first = renderHook(() => useRandom());
    expect([first.result.current(), first.result.current(), first.result.current()]).toEqual(expected);
    const second = renderHook(() => useRandom());
    expect([second.result.current(), second.result.current(), second.result.current()]).toEqual(expected);
  });

  it("is a stable function that keeps its sequence across renders", () => {
    navigate("?demo=1");
    const { result, rerender } = renderHook(() => useRandom());
    const next = result.current;
    const a = next();
    rerender();
    expect(result.current).toBe(next);
    expect(result.current()).not.toBe(a);
  });

  it("draws values in [0, 1) outside demo mode", () => {
    const { result } = renderHook(() => useRandom());
    for (let i = 0; i < 100; i++) {
      const value = result.current();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
