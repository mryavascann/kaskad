import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// jsdom lacks the browser APIs that Motion, Radix and NumberFlow feature-detect.
// Default media: no reduced-motion preference, fine pointer. A test can simulate reduced motion
// with `vi.spyOn(window, "matchMedia")`.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: query.includes("pointer: fine"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }),
});

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

for (const name of ["IntersectionObserver", "ResizeObserver"] as const) {
  if (!(name in window)) Object.defineProperty(window, name, { writable: true, configurable: true, value: NoopObserver });
}

// Radix Slider/Select use pointer capture; jsdom does not implement it.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
