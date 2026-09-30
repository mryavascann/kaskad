// CostLine reads the lazy signer: before lib/kaskad/signer loads it quotes the burner (the only
// possible state then); once loaded it follows the active signer's kind.
import { act, render, screen } from "@testing-library/react";
import type { Address } from "viem";
import { describe, expect, it, vi } from "vitest";

type State = { kind: "burner" | "injected" | "mera"; address: Address | null };
let state: State = { kind: "burner", address: "0x00000000000000000000000000000000000000b1" };
const listeners = new Set<() => void>();

vi.mock("@/lib/kaskad/signer", () => ({
  signerStore: {
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get: () => state,
    server: () => ({ kind: "burner", address: null }),
  },
}));

const { CostLine } = await import("./tx-parts");
const { loadSigner, signerIfLoaded } = await import("@/lib/chain/signer");

describe("CostLine payer", () => {
  it("quotes the sponsor before the signer loads, then follows the signer kind", async () => {
    render(<CostLine gasLimit={80_000n} locale="en" />);
    expect(screen.getByText(/the sponsor pays/)).toBeInTheDocument();
    expect(signerIfLoaded()).toBeNull(); // CostLine alone never loads the signer

    await act(async () => {
      await loadSigner();
    });
    expect(screen.getByText(/the sponsor pays/)).toBeInTheDocument();

    act(() => {
      state = { kind: "injected", address: "0x00000000000000000000000000000000000000c2" };
      listeners.forEach((l) => l());
    });
    expect(screen.getByText(/from your wallet/)).toBeInTheDocument();
  });
});
