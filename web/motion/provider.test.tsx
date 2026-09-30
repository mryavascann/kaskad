import { act, render, screen } from "@testing-library/react";
import { MotionConfigContext } from "motion/react";
import { useContext, useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { useForcedReducedMotion, usePrefersReducedMotion, useShouldReduceMotion } from "./hooks";
import { MotionProvider, ReducedMotionScope } from "./provider";
import { mockMatchMedia } from "./test-utils";
import { transition } from "./tokens";

const media = mockMatchMedia();

/** Prints what a component inside the tree sees. */
function Probe({ onMount }: { onMount?: () => void }) {
  const config = useContext(MotionConfigContext);
  const reduce = useShouldReduceMotion();
  const forced = useForcedReducedMotion();
  const system = usePrefersReducedMotion();
  useEffect(() => onMount?.(), [onMount]);
  return (
    <output data-testid="probe" data-config={config.reducedMotion} data-reduce={String(reduce)} data-forced={String(forced)} data-system={String(system)}>
      {JSON.stringify(config.transition)}
    </output>
  );
}

describe("MotionProvider", () => {
  it("renders its children", () => {
    render(
      <MotionProvider>
        <p>Cascade, measured.</p>
      </MotionProvider>,
    );
    expect(screen.getByText("Cascade, measured.")).toBeInTheDocument();
  });

  it("follows the OS setting (reducedMotion 'user') and sets transition.base as the default", () => {
    render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveAttribute("data-config", "user");
    expect(probe).toHaveAttribute("data-reduce", "false");
    expect(probe).toHaveTextContent(JSON.stringify(transition.base));
  });

  it("honors reduced motion from the OS for its children", () => {
    act(() => media.set({ reduce: true }));
    render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveAttribute("data-reduce", "true");
    expect(probe).toHaveAttribute("data-system", "true");
    // The OS setting is not a forced one: markup may not branch on it (the server cannot know it).
    expect(probe).toHaveAttribute("data-forced", "false");
    act(() => media.set({ reduce: false }));
  });
});

describe("ReducedMotionScope", () => {
  it("forces reduced motion inside, zeroes the travel variables and marks the subtree", () => {
    render(
      <MotionProvider>
        <ReducedMotionScope reduce className="scope">
          <Probe />
        </ReducedMotionScope>
      </MotionProvider>,
    );
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveAttribute("data-config", "always");
    expect(probe).toHaveAttribute("data-reduce", "true");
    expect(probe).toHaveAttribute("data-forced", "true");
    const scope = probe.closest(".scope") as HTMLElement;
    expect(scope).toHaveAttribute("data-motion", "reduced");
    for (const name of ["--nudge", "--rise", "--enter"]) expect(scope.style.getPropertyValue(name)).toBe("0px");
  });

  it("inherits the parent config when off and remounts the subtree when toggled", () => {
    const onMount = vi.fn();
    const { rerender } = render(
      <MotionProvider>
        <ReducedMotionScope reduce={false} className="scope">
          <Probe onMount={onMount} />
        </ReducedMotionScope>
      </MotionProvider>,
    );
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveAttribute("data-config", "user");
    expect(probe.closest(".scope")).not.toHaveAttribute("data-motion");
    expect(onMount).toHaveBeenCalledTimes(1);

    rerender(
      <MotionProvider>
        <ReducedMotionScope reduce className="scope">
          <Probe onMount={onMount} />
        </ReducedMotionScope>
      </MotionProvider>,
    );
    // Motion reads its config at mount, so the scope must remount its children to apply it.
    expect(onMount).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("probe")).toHaveAttribute("data-config", "always");
  });
});
