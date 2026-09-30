import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TxEvent } from "../status";

const proveScenario = vi.fn();
const proveMonteCarlo = vi.fn();
const runGuard = vi.fn();
const borrow = vi.fn();

// The real modules pull viem and the signer; the wrappers only have to load and delegate.
vi.mock("./proveScenario", () => ({ proveScenario: (...a: unknown[]) => proveScenario(...a) }));
vi.mock("./proveMonteCarlo", () => ({ proveMonteCarlo: (...a: unknown[]) => proveMonteCarlo(...a) }));
vi.mock("./runGuard", () => ({ runGuard: (...a: unknown[]) => runGuard(...a) }));
vi.mock("./borrow", () => ({ borrow: (...a: unknown[]) => borrow(...a) }));
vi.mock("../signer", () => ({ loadSigner: vi.fn(async () => ({})) }));

const lazy = await import("./lazy");

beforeEach(() => {
  for (const f of [proveScenario, proveMonteCarlo, runGuard, borrow]) f.mockReset();
});

describe("lazy proof actions", () => {
  it("load the action module and pass every argument through, returning its outcome", async () => {
    const onEvent = vi.fn();
    const outcome = { status: "cancelled", reason: "declined" };
    const sc = { assetId: 9 } as never;
    const res = { gasUsed: 1n, rounds: 1 } as never;

    proveScenario.mockResolvedValue(outcome);
    expect(await lazy.proveScenario(sc, res, { onEvent })).toBe(outcome);
    expect(proveScenario).toHaveBeenCalledWith(sc, res, { onEvent });

    proveMonteCarlo.mockResolvedValue(outcome);
    expect(await lazy.proveMonteCarlo(sc, 30, res, { onEvent })).toBe(outcome);
    expect(proveMonteCarlo).toHaveBeenCalledWith(sc, 30, res, { onEvent });

    runGuard.mockResolvedValue(outcome);
    expect(await lazy.runGuard({ onEvent })).toBe(outcome);
    expect(runGuard).toHaveBeenCalledWith({ onEvent });

    borrow.mockResolvedValue(outcome);
    expect(await lazy.borrow("0x0000000000000000000000000000000000000001", { onEvent })).toBe(outcome);
    expect(borrow).toHaveBeenCalledWith("0x0000000000000000000000000000000000000001", { onEvent });
  });

  it("keep the pure gas limits available without loading an action", () => {
    expect(lazy.proveScenarioGasLimit({ gasUsed: 1_000_000n, rounds: 3 })).toBeGreaterThan(1_000_000n);
    expect(lazy.proveMonteCarloGasLimit({ gasUsed: 1_000_000n })).toBeGreaterThan(1_000_000n);
  });
});

describe("lazy proof actions when the chunk fails to load", () => {
  it("return a failed outcome with its event instead of throwing", async () => {
    vi.resetModules();
    vi.doMock("./proveScenario", () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const fresh = await import("./lazy");
    const events: TxEvent[] = [];
    const out = await fresh.proveScenario({ assetId: 9 } as never, { gasUsed: 1n, rounds: 1 } as never, { onEvent: (e) => events.push(e) });
    expect(out.status).toBe("failed");
    expect(events.at(-1)?.step).toBe("failed");
    expect(proveScenario).not.toHaveBeenCalled();
  });
});
