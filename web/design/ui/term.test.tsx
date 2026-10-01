import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Term } from "./term";

const HF = "Collateral value × liquidation threshold ÷ debt. Below 1.0 the position can be liquidated.";

function Sentence() {
  return (
    <p>
      A position whose{" "}
      <Term title="Health factor" description={HF}>
        health factor
      </Term>{" "}
      falls below 1 can be liquidated. <button type="button">Next control</button>
    </p>
  );
}

describe("Term", () => {
  it("renders the word as a collapsed button inside the sentence", () => {
    render(<Sentence />);
    const term = screen.getByRole("button", { name: "health factor" });
    expect(term).toHaveAttribute("aria-expanded", "false");
    expect(term).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("toggles the explanation on click", async () => {
    const user = userEvent.setup();
    render(<Sentence />);
    const term = screen.getByRole("button", { name: "health factor" });

    await user.click(term);
    const panel = screen.getByRole("dialog", { name: "Health factor" });
    expect(panel).toHaveTextContent(HF);
    expect(term).toHaveAttribute("aria-expanded", "true");

    await user.click(term);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(term).toHaveAttribute("aria-expanded", "false");
  });

  it("opens with Enter or Space, moves focus in, and Escape returns focus to the term", async () => {
    const user = userEvent.setup();
    render(<Sentence />);
    const term = screen.getByRole("button", { name: "health factor" });

    await user.tab();
    expect(term).toHaveFocus();
    await user.keyboard("{Enter}");
    const panel = screen.getByRole("dialog", { name: "Health factor" });
    await waitFor(() => expect(panel).toHaveFocus());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(term).toHaveFocus();

    await user.keyboard(" ");
    expect(screen.getByRole("dialog", { name: "Health factor" })).toBeInTheDocument();
  });

  it("sends Shift+Tab from the panel back to the term", async () => {
    const user = userEvent.setup();
    render(<Sentence />);
    const term = screen.getByRole("button", { name: "health factor" });
    await user.click(term);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(term).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens on mouse hover without taking focus, and closes when the pointer leaves", async () => {
    const user = userEvent.setup();
    render(<Sentence />);
    const term = screen.getByRole("button", { name: "health factor" });

    await user.hover(term);
    const panel = await screen.findByRole("dialog", { name: "Health factor" });
    expect(panel).not.toHaveFocus();

    await user.unhover(term);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("stays open after the pointer leaves when it was opened by a click", async () => {
    const user = userEvent.setup();
    render(<Sentence />);
    const term = screen.getByRole("button", { name: "health factor" });
    await user.hover(term);
    await user.click(term);
    await user.unhover(term);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByRole("dialog", { name: "Health factor" })).toBeInTheDocument();
  });

  it("uses the word itself as the title by default", async () => {
    const user = userEvent.setup();
    render(<Term description="A read-only call. Costs nothing, changes nothing.">eth_call</Term>);
    await user.click(screen.getByRole("button", { name: "eth_call" }));
    expect(screen.getByRole("dialog", { name: "eth_call" })).toBeInTheDocument();
  });
});
