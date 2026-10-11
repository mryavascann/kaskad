import { afterEach, describe, expect, it, vi } from "vitest";
import { clientKey, readJson } from "./request";

const req = (headers: Record<string, string>) => new Request("http://localhost", { headers });
afterEach(() => vi.useRealTimers());

describe("bounded request parsing and client identity", () => {
  it("prefers x-real-ip, canonicalizes IPv6 and mapped IPv4, hashes stored identities", () => {
    const key = clientKey(req({ "x-real-ip": "192.0.2.1", "x-forwarded-for": "192.0.2.2" }));
    expect(key).toBe(clientKey(req({ "x-forwarded-for": "192.0.2.1, 192.0.2.3" })));
    expect(key).toBe(clientKey(req({ "x-real-ip": "::ffff:192.0.2.1" })));
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(clientKey(req({ "x-real-ip": "2001:db8::1" }))).toBe(clientKey(req({ "x-real-ip": "2001:0db8:0:0:0:0:0:1" })));
  });
  it("puts absent, malformed and scoped addresses in one bucket", () => {
    for (const ip of ["arbitrary", "192.0.2.1, 192.0.2.2", "fe80::1%en0"])
      expect(clientKey(req({ "x-real-ip": ip }))).toBe(clientKey(req({})));
  });
  it("reads valid JSON and rejects empty or malformed bodies", async () => {
    expect(await readJson(new Request("http://localhost", { method: "POST", body: '{"a":1}' }), 20)).toEqual({ a: 1 });
    for (const body of [undefined, "{"]) await expect(readJson(new Request("http://localhost", { method: "POST", body }), 20)).rejects.toMatchObject({ status: 400 });
  });
  it("enforces both advertised and actual size even with a false Content-Length", async () => {
    for (const length of ["1", "100"]) await expect(readJson(new Request("http://localhost", { method: "POST", body: '"123456789"', headers: { "content-length": length } }), 5)).rejects.toMatchObject({ status: 413 });
  });
  it("cancels stalled body streams", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const request = new Request("http://localhost", { method: "POST", body, duplex: "half" } as RequestInit);
    const result = expect(readJson(request, 20)).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(5_001);
    await result;
    expect(cancel).toHaveBeenCalledOnce();
  });
});
