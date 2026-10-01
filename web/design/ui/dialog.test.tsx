import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";

function AboutData() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>About this data</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Real positions, replayed on testnet</DialogTitle>
          <DialogDescription>Every borrower is read from Aave on Monad mainnet.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="primary">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Confirm({ onConfirm = vi.fn(), busy = false }: { onConfirm?: () => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Prove on-chain</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="warn"
        title="Send this transaction?"
        description="This transaction costs about {cost} MON on testnet; the sponsor pays."
        confirmLabel="Send transaction"
        onConfirm={onConfirm}
        busy={busy}
      />
    </>
  );
}

describe("Dialog", () => {
  it("opens a named, described modal dialog", async () => {
    const user = userEvent.setup();
    render(<AboutData />);
    await user.click(screen.getByRole("button", { name: "About this data" }));
    const dialog = screen.getByRole("dialog", { name: "Real positions, replayed on testnet" });
    expect(dialog).toHaveAccessibleDescription("Every borrower is read from Aave on Monad mainnet.");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<AboutData />);
    const trigger = screen.getByRole("button", { name: "About this data" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes from DialogClose and from the corner button", async () => {
    const user = userEvent.setup();
    render(<AboutData />);
    await user.click(screen.getByRole("button", { name: "About this data" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "About this data" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("ConfirmDialog", () => {
  it("is an alert dialog with focus on Cancel", async () => {
    const user = userEvent.setup();
    render(<Confirm />);
    await user.click(screen.getByRole("button", { name: "Prove on-chain" }));
    const dialog = screen.getByRole("alertdialog", { name: "Send this transaction?" });
    expect(dialog).toHaveAccessibleDescription("This transaction costs about {cost} MON on testnet; the sponsor pays.");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("calls onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Confirm onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Prove on-chain" }));
    await user.click(screen.getByRole("button", { name: "Send transaction" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes on Cancel and on Escape, returning focus", async () => {
    const user = userEvent.setup();
    render(<Confirm />);
    const trigger = screen.getByRole("button", { name: "Prove on-chain" });

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    await user.click(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("locks itself while busy", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Confirm busy onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Prove on-chain" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    const confirm = screen.getByRole("button", { name: "Send transaction" });
    expect(confirm).toHaveAttribute("aria-busy", "true");
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
