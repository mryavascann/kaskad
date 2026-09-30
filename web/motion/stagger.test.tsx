import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MotionProvider, ReducedMotionScope } from "./provider";
import { Stagger, StaggerItem } from "./stagger";
import { mockIntersectionObserver, mockMatchMedia } from "./test-utils";

mockMatchMedia();
const viewport = mockIntersectionObserver();

const rows = ["First liquidation", "Second wave", "Third wave"];

function List(props: Partial<Parameters<typeof Stagger>[0]>) {
  return (
    <MotionProvider>
      <Stagger as="ul" aria-label="Waves" {...props}>
        {rows.map((row) => (
          <StaggerItem as="li" key={row}>
            {row}
          </StaggerItem>
        ))}
      </Stagger>
    </MotionProvider>
  );
}

const opacity = (text: string) => Number(screen.getByText(text).style.opacity);

describe("Stagger", () => {
  it("renders the container and its items as the requested elements", () => {
    render(<List gap="tight" />);
    const list = screen.getByRole("list", { name: "Waves" });
    expect(list).toHaveAttribute("data-stagger", "tight");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    for (const item of screen.getAllByRole("listitem")) expect(item).toHaveAttribute("data-reveal");
  });

  it("keeps items hidden until the container scrolls into view (trigger 'view')", async () => {
    render(<List />);
    await new Promise((resolve) => setTimeout(resolve, 60));
    for (const row of rows) expect(opacity(row)).toBe(0);
    expect(screen.getByText(rows[0]).style.transform).toBe("translateY(var(--rise))");

    act(() => viewport.intersect());
    await waitFor(() => expect(opacity(rows[2])).toBe(1), { timeout: 2000 });
    for (const row of rows) expect(screen.getByText(row).style.transform).toBe("none");
  });

  it("plays in order on mount with trigger 'mount'", async () => {
    render(<List trigger="mount" gap="loose" />);
    // 60 ms apart: the first item is on its way while the last one has not started yet.
    await waitFor(() => expect(opacity(rows[0])).toBeGreaterThan(0), { timeout: 1000 });
    expect(opacity(rows[0])).toBeGreaterThan(opacity(rows[2]));
    await waitFor(() => expect(opacity(rows[2])).toBe(1), { timeout: 2000 });
  });

  it("fades items without travel under forced reduced motion", () => {
    render(
      <MotionProvider>
        <ReducedMotionScope reduce>
          <Stagger trigger="mount">
            <StaggerItem>Quiet</StaggerItem>
          </Stagger>
        </ReducedMotionScope>
      </MotionProvider>,
    );
    expect(screen.getByText("Quiet").style.transform).toBe("none");
  });
});
