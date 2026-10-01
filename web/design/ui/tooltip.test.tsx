import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Copy } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { Tooltip, TooltipProvider } from "./tooltip";

function CopyButton() {
  return (
    <Tooltip content="Copy link">
      <Button size="icon" aria-label="Copy link">
        <Copy />
      </Button>
    </Tooltip>
  );
}

describe("Tooltip", () => {
  it("opens on keyboard focus, describes its trigger and closes with Escape", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <CopyButton />
      </TooltipProvider>,
    );
    const button = screen.getByRole("button", { name: "Copy link" });

    await user.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy link");
    expect(button).toHaveAccessibleDescription("Copy link");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it("opens on hover and closes once the pointer moves away", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <CopyButton />
      </TooltipProvider>,
    );
    const button = screen.getByRole("button", { name: "Copy link" });
    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy link");
    // Radix keeps the tooltip while the pointer may be travelling into it; a move elsewhere closes it.
    await user.unhover(button);
    await user.pointer({ target: document.body, coords: { clientX: 400, clientY: 400 } });
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("brings its own provider when none is mounted", async () => {
    const user = userEvent.setup();
    render(<CopyButton />);
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy link");
  });
});
