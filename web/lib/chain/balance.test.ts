import { describe, expect, it, vi } from "vitest";
import { fetchBalance } from "./balance";

const ADDR = "0x1111111111111111111111111111111111111111";
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("fetchBalance", () => {
  it("posts one eth_getBalance at latest and parses the quantity", async () => {
    const f = reply({ jsonrpc: "2.0", id: 1, result: "0xde0b6b3a7640000" });
    expect(await fetchBalance(ADDR, { url: "http://x/api/rpc", fetchImpl: f as unknown as typeof fetch })).toBe(10n ** 18n);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ method: "eth_getBalance", params: [ADDR, "latest"] });
  });

  it("throws on HTTP and RPC errors", async () => {
    await expect(fetchBalance(ADDR, { url: "u", fetchImpl: reply({}, 429) as unknown as typeof fetch })).rejects.toThrow(/Status: 429/);
    await expect(fetchBalance(ADDR, { url: "u", fetchImpl: reply({ error: { code: -32601, message: "method not allowed" } }) as unknown as typeof fetch })).rejects.toThrow(/method not allowed/);
  });
});
