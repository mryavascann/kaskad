import { act, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MotionProvider, ReducedMotionScope } from "./provider";
import { Reveal, RevealNoScript } from "./reveal";
import { mockIntersectionObserver, mockMatchMedia } from "./test-utils";

mockMatchMedia();
const viewport = mockIntersectionObserver();

describe("Reveal", () => {
  it("renders the requested element with its content, props and a data-reveal marker", () => {
    render(
      <Reveal as="section" id="proof" aria-label="Proof" className="grid">
        <p>One transaction.</p>
      </Reveal>,
    );
    const section = screen.getByRole("region", { name: "Proof" });
    expect(section.tagName).toBe("SECTION");
    expect(section).toHaveAttribute("id", "proof");
    expect(section).toHaveAttribute("data-reveal");
    expect(section).toHaveClass("grid");
    expect(screen.getByText("One transaction.")).toBeInTheDocument();
  });

  it("starts hidden, lowered by the --rise token, and does not play before it is in view", async () => {
    render(<Reveal>Below the fold</Reveal>);
    const element = screen.getByText("Below the fold");
    expect(element.style.opacity).toBe("0");
    expect(element.style.transform).toBe("translateY(var(--rise))");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(element.style.opacity).toBe("0");
  });

  it("fades and rises into place once it enters the viewport", async () => {
    render(
      <MotionProvider>
        <Reveal delay={0}>Revealed</Reveal>
      </MotionProvider>,
    );
    const element = screen.getByText("Revealed");
    // MotionProvider loads the feature bundle asynchronously (LazyMotion); in-view starts after it.
    await act(async () => {
      await import("./features");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => viewport.intersect());
    await waitFor(() => expect(Number(element.style.opacity)).toBe(1), { timeout: 2000 });
    expect(element.style.transform).toBe("none");
  });

  it("only fades (no travel) when reduced motion is forced", () => {
    render(
      <MotionProvider>
        <ReducedMotionScope reduce>
          <Reveal>Still</Reveal>
        </ReducedMotionScope>
      </MotionProvider>,
    );
    const element = screen.getByText("Still");
    expect(element.style.opacity).toBe("0");
    expect(element.style.transform).toBe("none");
  });
});

describe("RevealNoScript", () => {
  it("un-hides every [data-reveal] element when JavaScript is off", () => {
    const html = renderToStaticMarkup(<RevealNoScript />);
    expect(html).toBe("<noscript><style>[data-reveal]{opacity:1!important;transform:none!important}</style></noscript>");
  });
});
