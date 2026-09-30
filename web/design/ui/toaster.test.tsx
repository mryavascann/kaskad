import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Toaster, notify, toast } from "./toaster";

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
});

const toastFor = async (title: string) => (await screen.findByText(title)).closest("[data-sonner-toast]") as HTMLElement;

describe("Toaster", () => {
  it("mounts a labelled notifications region at the bottom right", async () => {
    render(<Toaster />);
    act(() => {
      notify("Preview is free");
    });
    const item = await toastFor("Preview is free");
    expect(screen.getByRole("region", { name: /Notifications/ })).toBeInTheDocument();
    expect(item).toHaveAttribute("data-y-position", "bottom");
    expect(item).toHaveAttribute("data-x-position", "right");
  });

  it("maps notify tones to sonner types and tone icons", async () => {
    render(<Toaster />);
    act(() => {
      notify("Transaction reverted", { tone: "liq", description: "BorrowIsPaused" });
      notify("Confirmed on Monad testnet", { tone: "safe" });
      notify("Worst-case oracle mode", { tone: "warn" });
    });
    const liq = await toastFor("Transaction reverted");
    expect(liq).toHaveAttribute("data-type", "error");
    expect(liq.querySelector("svg.lucide-octagon-alert")).not.toBeNull();
    expect(screen.getByText("BorrowIsPaused")).toBeInTheDocument();
    expect((await toastFor("Confirmed on Monad testnet")).querySelector("svg.lucide-shield-check")).not.toBeNull();
    expect((await toastFor("Worst-case oracle mode")).getAttribute("data-type")).toBe("warning");
  });

  it("gives calm and monad toasts their icon and tone variable", async () => {
    render(<Toaster />);
    act(() => {
      notify("Realistic oracle mode", { tone: "calm" });
      notify("Burner wallet ready", { tone: "monad" });
    });
    const calm = await toastFor("Realistic oracle mode");
    expect(calm.querySelector("svg.lucide-activity")).not.toBeNull();
    expect(calm.style.getPropertyValue("--tone")).toBe("var(--color-calm-hi)");
    const monad = await toastFor("Burner wallet ready");
    expect(monad.querySelector("svg.lucide-box")).not.toBeNull();
  });

  it("styles toasts with tokens (unstyled sonner) and offers a named close button", async () => {
    render(<Toaster />);
    act(() => {
      notify("RPC unreachable", { tone: "liq" });
    });
    const item = await toastFor("RPC unreachable");
    expect(item).toHaveAttribute("data-styled", "false");
    expect(item).toHaveClass("bg-elev-2", "border-line-3", "rounded-panel", "shadow-pop");
    expect(screen.getByRole("button", { name: "Close toast" })).toBeInTheDocument();
  });

  it("only shows toasts addressed to its id when it has one", async () => {
    render(
      <>
        <Toaster />
        <Toaster id="demo" />
      </>,
    );
    act(() => {
      notify("Scoped", { toasterId: "demo" });
    });
    expect(await screen.findAllByText("Scoped")).toHaveLength(1);
  });
});
