import { act, renderHook } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useFinePointer, useForcedReducedMotion, usePrefersReducedMotion, useShouldReduceMotion } from "./hooks";
import { mockMatchMedia } from "./test-utils";

const media = mockMatchMedia({ fine: true, reduce: false });

describe("media hooks", () => {
  it("follow the device live", () => {
    const pointer = renderHook(() => useFinePointer());
    const system = renderHook(() => usePrefersReducedMotion());
    expect(pointer.result.current).toBe(true);
    expect(system.result.current).toBe(false);
    act(() => media.set({ fine: false, reduce: true }));
    expect(pointer.result.current).toBe(false);
    expect(system.result.current).toBe(true);
    act(() => media.set({ fine: true, reduce: false }));
    expect(pointer.result.current).toBe(true);
  });

  it("render the server value (false) outside the browser tree, so hydration never mismatches", () => {
    function Probe() {
      return <p>{`${useFinePointer()} ${usePrefersReducedMotion()}`}</p>;
    }
    act(() => media.set({ fine: true, reduce: true }));
    expect(renderToString(<Probe />)).toContain("false false");
    act(() => media.set({ reduce: false }));
  });
});

describe("reduced-motion config hooks", () => {
  const withConfig = (reducedMotion: "always" | "never" | "user") =>
    function Wrapper({ children }: { children: ReactNode }) {
      return <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>;
    };

  it("useShouldReduceMotion follows MotionConfig, falling back to the OS for 'user'", () => {
    expect(renderHook(() => useShouldReduceMotion(), { wrapper: withConfig("always") }).result.current).toBe(true);
    expect(renderHook(() => useShouldReduceMotion(), { wrapper: withConfig("never") }).result.current).toBe(false);
    expect(renderHook(() => useShouldReduceMotion(), { wrapper: withConfig("user") }).result.current).toBe(false);
  });

  it("useForcedReducedMotion is true only for reducedMotion 'always'", () => {
    act(() => media.set({ reduce: true }));
    expect(renderHook(() => useForcedReducedMotion(), { wrapper: withConfig("always") }).result.current).toBe(true);
    expect(renderHook(() => useForcedReducedMotion(), { wrapper: withConfig("user") }).result.current).toBe(false);
    act(() => media.set({ reduce: false }));
  });
});
