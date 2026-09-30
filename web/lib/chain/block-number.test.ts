import { afterEach, describe, expect, it, vi } from "vitest";
import { blockNumberEndpoint, BlockNumberError, fetchBlockNumber, parseQuantity } from "./block-number";

const reply = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

afterEach(() => vi.useRealTimers());

describe("parseQuantity", () => {
  it("parses hex quantities to bigint", () => {
    expect(parseQuantity("0x0")).toBe(0n);
    expect(parseQuantity("0x3ff3a3d")).toBe(67_058_237n);
    expect(parseQuantity("0xFFFFFFFFFFFFFFFFFF")).toBe(2n ** 72n - 1n);
  });

  it.each([undefined, null, 12, "", "0x", "123", "0xzz", "-0x1"])("rejects %o", (value) => {
    expect(() => parseQuantity(value)).toThrow(BlockNumberError);
  });
});

describe("fetchBlockNumber", () => {
  it("POSTs one eth_blockNumber call and returns the block", async () => {
    const fetchImpl = reply({ jsonrpc: "2.0", id: 1, result: "0x3ff3a3d" });
    await expect(fetchBlockNumber({ url: "https://rpc.test/api/rpc", fetchImpl })).resolves.toBe(67_058_237n);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://rpc.test/api/rpc");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ jsonrpc: "2.0", id: expect.any(Number), method: "eth_blockNumber", params: [] });
  });

  it("keeps viem's `Status: 429` line on a rate limit (the hook maps it to rate-limited)", async () => {
    const error = await fetchBlockNumber({ url: "x", fetchImpl: reply({ error: "çok fazla istek" }, 429) }).catch((e) => e);
    expect(error).toBeInstanceOf(BlockNumberError);
    expect(error.status).toBe(429);
    expect(error.message).toMatch(/Status: 429/);
    expect(error.message).toMatch(/çok fazla istek/);
  });

  it("rejects JSON-RPC errors, bad JSON and bad results", async () => {
    await expect(fetchBlockNumber({ url: "x", fetchImpl: reply({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "method not allowed" } }) })).rejects.toThrow(
      /-32601: method not allowed/,
    );
    await expect(fetchBlockNumber({ url: "x", fetchImpl: reply("<html>") })).rejects.toThrow(/Invalid JSON-RPC/);
    await expect(fetchBlockNumber({ url: "x", fetchImpl: reply({ jsonrpc: "2.0", id: 1, result: null }) })).rejects.toThrow(/Invalid block number/);
    await expect(fetchBlockNumber({ url: "x", fetchImpl: reply("bad gateway", 502) })).rejects.toThrow(/Status: 502/);
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    const pending = fetchBlockNumber({ url: "x", fetchImpl, timeoutMs: 5_000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await pending).message).toMatch(/took too long/);
  });

  it("uses the public testnet RPC on the server and /api/rpc in the browser", () => {
    const override = process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC;
    delete process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC;
    try {
      expect(blockNumberEndpoint()).toBe("https://testnet-rpc.monad.xyz");
      vi.stubGlobal("window", { location: { origin: "https://kaskad.test" } });
      expect(blockNumberEndpoint()).toBe("https://kaskad.test/api/rpc");
    } finally {
      vi.unstubAllGlobals();
      if (override !== undefined) process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC = override;
    }
  });
});
