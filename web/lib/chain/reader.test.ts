import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_BATCH_CALLS, defaultReader } from "./reader";

describe("defaultReader", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never sends a JSON-RPC batch larger than the proxy accepts (stubbed fetch, no network)", async () => {
    const sizes: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: { body: string }) => {
        const body = JSON.parse(init.body) as { id: number }[];
        sizes.push(body.length);
        return new Response(JSON.stringify(body.map((b) => ({ jsonrpc: "2.0", id: b.id, result: "0x1" }))), {
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const reader = defaultReader();
    expect(defaultReader()).toBe(reader);
    const address = "0x0000000000000000000000000000000000000001";
    const balances = await Promise.all(Array.from({ length: 45 }, () => reader.getBalance({ address })));
    expect(balances.every((b) => b === 1n)).toBe(true);
    expect(sizes.reduce((s, n) => s + n, 0)).toBe(45);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_BATCH_CALLS);
    expect(MAX_BATCH_CALLS).toBe(10);
  });
});
