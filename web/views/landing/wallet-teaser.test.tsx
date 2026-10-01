import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLES } from "@/lib/chain/wallet";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { WalletTeaser, walletHref, looksLikeAddress } = await import("./wallet-teaser");
const { WALLET_SAMPLES } = await import("./landing");

beforeEach(() => push.mockReset());

describe("WalletTeaser", () => {
  it("rejects an invalid address with a message tied to the field", async () => {
    render(<WalletTeaser locale="en" samples={WALLET_SAMPLES} />);
    const input = screen.getByRole("textbox", { name: "Wallet address" });
    await userEvent.type(input, "0x1234");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(push).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Enter a valid address/);
  });

  it("opens the wallet page with a valid address", async () => {
    render(<WalletTeaser locale="en" samples={WALLET_SAMPLES} />);
    const address = SAMPLES[0].address;
    await userEvent.type(screen.getByRole("textbox", { name: "Wallet address" }), `  ${address} `);
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith(`/wallet?address=${address}`);
  });

  it("checks the address shape without viem: 0x + 40 hex digits", () => {
    expect(looksLikeAddress(SAMPLES[0].address)).toBe(true);
    expect(looksLikeAddress(SAMPLES[0].address.toLowerCase())).toBe(true);
    expect(looksLikeAddress(SAMPLES[0].address.slice(0, -1))).toBe(false);
    expect(looksLikeAddress(`${SAMPLES[0].address}0`)).toBe(false);
    expect(looksLikeAddress(`0x${"g".repeat(40)}`)).toBe(false);
    expect(looksLikeAddress(SAMPLES[0].address.slice(2))).toBe(false);
  });

  it("gets the samples from lib/chain/wallet through the server (id, address, short form)", () => {
    expect(WALLET_SAMPLES.map((s) => s.address)).toEqual(SAMPLES.map((s) => s.address));
    expect(WALLET_SAMPLES[0].short).toBe(`${SAMPLES[0].address.slice(0, 6)}…${SAMPLES[0].address.slice(-4)}`);
  });

  it("links every sample borrower, in Turkish under /tr/cuzdan", () => {
    render(<WalletTeaser locale="tr" samples={WALLET_SAMPLES} />);
    expect(screen.getByRole("textbox", { name: "Cüzdan adresi" })).toBeInTheDocument();
    for (const s of SAMPLES) {
      expect(screen.getByRole("link", { name: new RegExp(s.address.slice(0, 6)) })).toHaveAttribute("href", walletHref("tr", s.address));
    }
    expect(walletHref("tr", SAMPLES[0].address)).toBe(`/tr/cuzdan?address=${SAMPLES[0].address}`);
  });
});
