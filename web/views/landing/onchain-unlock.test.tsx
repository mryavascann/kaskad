import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockIntersectionObserver, mockMatchMedia } from "@/motion/test-utils";

const media = mockMatchMedia();
const io = mockIntersectionObserver();

const { OnchainUnlock } = await import("./onchain-unlock");
const { ReducedMotionScope } = await import("@/motion/provider");

const copy = {
  external: "opens in a new tab",
  report: { name: "Risk report", fee: "$5M / year", tags: ["Private"], locked: "Locked", body: "Body", source: "Source", sourceHref: "https://example.com" },
  block: { name: "Kaskad result", tags: ["Public"], body: "Anyone can verify it.", proof: "See the proof", proofHref: "https://example.com/tx", rows: [["Stuck", "$111.0M"]] as [string, string | null][] },
};

/** Places the section `top` px from the viewport's top edge. */
function placeAt(top: number) {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top, bottom: top + 400, left: 0, right: 800, width: 800, height: 400, x: 0, y: top, toJSON() {} } as DOMRect);
}

const root = () => document.querySelector<HTMLElement>("[data-landing-unlock]")!;

afterEach(() => {
  vi.restoreAllMocks();
  media.set({ reduce: false });
});

describe("OnchainUnlock", () => {
  it("renders the linked, readable state before any script runs (server and no-JS)", () => {
    placeAt(0);
    render(<OnchainUnlock copy={copy} missing="missing" />);
    expect(root().dataset.unlock).toBeUndefined();
    expect(screen.getByText("$111.0M")).toBeVisible();
  });

  it("locks a section still below the viewport, unlocks it once in view, and never re-locks", () => {
    placeAt(5000);
    render(<OnchainUnlock copy={copy} missing="missing" />);
    expect(root().dataset.unlock).toBe("locked");
    act(() => io.intersect(true));
    expect(root().dataset.unlock).toBe("open");
    act(() => io.intersect(false));
    act(() => io.intersect(true));
    expect(root().dataset.unlock).toBe("open");
  });

  it("leaves a section already on screen (or scrolled past) linked", () => {
    placeAt(-3000);
    render(<OnchainUnlock copy={copy} missing="missing" />);
    expect(root().dataset.unlock).toBeUndefined();
  });

  it("stays linked under reduced motion", () => {
    placeAt(5000);
    render(
      <ReducedMotionScope reduce>
        <OnchainUnlock copy={copy} missing="missing" />
      </ReducedMotionScope>,
    );
    expect(root().dataset.unlock).toBeUndefined();
  });
});
