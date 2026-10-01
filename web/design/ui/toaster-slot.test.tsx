import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("ToasterSlot", () => {
  it("renders nothing (and loads no sonner) until a page imports the toaster, then mounts it", async () => {
    vi.resetModules();
    const { ToasterSlot } = await import("./toaster-slot");
    const { container } = render(<ToasterSlot />);
    expect(container).toBeEmptyDOMElement();
    expect(document.querySelector("[data-sonner-toaster]")).toBeNull();

    // Importing the toaster (as every notify caller does) requests the slot; the toast created
    // before the Toaster subscribed is replayed by sonner.
    const { notify, toast } = await act(() => import("./toaster"));
    act(() => {
      notify("Queued before mount", { tone: "safe" });
    });
    expect(await screen.findByText("Queued before mount", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Notifications/ })).toBeInTheDocument();
    act(() => {
      toast.dismiss();
    });
  });

  it("requestToaster is idempotent", async () => {
    vi.resetModules();
    const { requestToaster } = await import("./toaster-slot");
    expect(() => {
      requestToaster();
      requestToaster();
    }).not.toThrow();
  });
});
