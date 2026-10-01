// The lazy signer handle: nothing loads until asked, the state before loading is the server
// snapshot, and runTx / borrow load the real module only when they need the signer.
import type { Address, TransactionReceipt } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

type State = { kind: "burner" | "injected" | "mera"; address: Address | null };
const BURNER = "0x00000000000000000000000000000000000000b1" as Address;
let state: State = { kind: "burner", address: BURNER };
const moduleListeners = new Set<() => void>();
const sendTx = vi.fn();
let loads = 0;

vi.mock("@/lib/kaskad/signer", () => {
  loads++;
  return {
    signerStore: {
      subscribe: (l: () => void) => {
        moduleListeners.add(l);
        return () => moduleListeners.delete(l);
      },
      get: () => state,
      server: () => ({ kind: "burner", address: null }),
    },
    sendTx: (...a: unknown[]) => sendTx(...a),
  };
});

const setState = (next: State) => {
  state = next;
  moduleListeners.forEach((l) => l());
};

beforeEach(() => {
  vi.resetModules();
  loads = 0;
  state = { kind: "burner", address: BURNER };
  moduleListeners.clear();
  sendTx.mockReset();
});

describe("lazy signer store", () => {
  it("returns the server snapshot until the module loads, then follows the module's store", async () => {
    const { lazySignerStore, loadSigner, signerIfLoaded, SIGNER_SERVER_SNAPSHOT } = await import("./signer");
    expect(lazySignerStore.get()).toBe(SIGNER_SERVER_SNAPSHOT);
    expect(lazySignerStore.get()).toEqual({ kind: "burner", address: null });
    expect(lazySignerStore.server()).toBe(SIGNER_SERVER_SNAPSHOT);
    expect(signerIfLoaded()).toBeNull();
    expect(loads).toBe(0);

    const seen = vi.fn();
    lazySignerStore.subscribe(seen);
    const [a, b] = await Promise.all([loadSigner(), loadSigner()]);
    expect(a).toBe(b);
    expect(loads).toBe(1);
    expect(seen).toHaveBeenCalledTimes(1); // the load itself is a change (address appears)
    expect(lazySignerStore.get()).toEqual({ kind: "burner", address: BURNER });

    setState({ kind: "injected", address: "0x00000000000000000000000000000000000000c2" });
    expect(seen).toHaveBeenCalledTimes(2);
    expect(lazySignerStore.get().kind).toBe("injected");
  });
});

describe("runTx with the lazy signer", () => {
  const receipt = { transactionHash: `0x${"ab".repeat(32)}`, status: "success", logs: [] } as unknown as TransactionReceipt;

  it("does not load the signer when the test injects send and signerKind", async () => {
    const { runTx } = await import("./tx");
    const { signerIfLoaded } = await import("./signer");
    const send = vi.fn(async () => ({ receipt, ms: 1, sync: true }));
    const out = await runTx({ to: BURNER, data: "0x", gas: 21_000n, confirmGate: true }, { send, signerKind: "burner" });
    expect(out.status).toBe("confirmed");
    expect(signerIfLoaded()).toBeNull();
  });

  it("loads the signer and sends through its sendTx, with the active kind for the cost gate", async () => {
    const { runTx } = await import("./tx");
    const { signerIfLoaded } = await import("./signer");
    sendTx.mockImplementation(async (_to, _data, _gas, onStatus: (s: string) => void) => {
      onStatus("Gönderiliyor (eth_sendRawTransactionSync)…");
      return { receipt, ms: 5, sync: true };
    });
    setState({ kind: "injected", address: "0x00000000000000000000000000000000000000c2" });
    const confirm = vi.fn(() => true);
    // 30M gas >= 1 MON: the gate asks, and the quote names the active signer's payer (wallet).
    const events: string[] = [];
    const out = await runTx({ to: BURNER, data: "0x12", gas: 30_000_000n, confirmGate: true }, { confirm, onEvent: (e) => events.push(e.step) });
    expect(signerIfLoaded()).not.toBeNull();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ payer: "wallet" }));
    expect(sendTx).toHaveBeenCalledWith(BURNER, "0x12", 30_000_000n, expect.any(Function));
    expect(out.status).toBe("confirmed");
    expect(events).toEqual(["sending", "confirmed"]);
  });
});
