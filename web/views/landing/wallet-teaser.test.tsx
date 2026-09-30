import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLES } from "@/lib/chain/wallet";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { WalletTeaser, walletHref } = await import("./wallet-teaser");

beforeEach(() => push.mockReset());

describe("WalletTeaser", () => {
  it("rejects an invalid address with a message tied to the field", async () => {
    render(<WalletTeaser locale="en" />);
    const input = screen.getByRole("textbox", { name: "Wallet address" });
    await userEvent.type(input, "0x1234");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(push).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Enter a valid address/);
  });

  it("opens the wallet page with a valid address", async () => {
    render(<WalletTeaser locale="en" />);
    const address = SAMPLES[0].address;
    await userEvent.type(screen.getByRole("textbox", { name: "Wallet address" }), `  ${address} `);
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith(`/wallet?address=${address}`);
  });

  it("links every sample borrower, in Turkish under /tr/cuzdan", () => {
    render(<WalletTeaser locale="tr" />);
    expect(screen.getByRole("textbox", { name: "Cüzdan adresi" })).toBeInTheDocument();
    for (const s of SAMPLES) {
      expect(screen.getByRole("link", { name: new RegExp(s.address.slice(0, 6)) })).toHaveAttribute("href", walletHref("tr", s.address));
    }
    expect(walletHref("tr", SAMPLES[0].address)).toBe(`/tr/cuzdan?address=${SAMPLES[0].address}`);
  });
});
