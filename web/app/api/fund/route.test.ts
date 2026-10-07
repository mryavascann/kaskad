import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseEther, parseTransaction } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { memoryProtection, type Protection } from "@/lib/server/protection";
import { ApiError } from "@/lib/server/request";

const state = vi.hoisted(() => ({ guard: undefined as Protection | undefined, balance: vi.fn(), nonce: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/server/protection", async (original) => ({ ...await original<typeof import("@/lib/server/protection")>(), protection: () => state.guard! }));
vi.mock("viem", async (original) => ({ ...await original<typeof import("viem")>(), createPublicClient: () => ({ getBalance: state.balance, getTransactionCount: state.nonce }) }));
vi.mock("@/lib/kaskad/tx", async (original) => ({ ...await original<typeof import("@/lib/kaskad/tx")>(), sendRawSync: state.send }));
import { GET, POST } from "./route";

// Public deterministic test key; all RPC/transaction transports are mocked.
const key = `0x${"11".repeat(32)}` as const;
const sponsor = privateKeyToAccount(key).address;
const recipient = "0x0000000000000000000000000000000000000001";
const hash = `0x${"ab".repeat(32)}`;
const body = (address = recipient, need = "4.5") => ({ address, needWei: parseEther(need).toString() });
const req = (payload: unknown = body(), ip = "192.0.2.1") => new Request("http://localhost/api/fund", { method: "POST", body: JSON.stringify(payload), headers: { "x-real-ip": ip } });
const balances = (target: bigint, available = parseEther("40")) => state.balance.mockImplementation(async ({ address }) => address === sponsor ? available : target);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SPONSOR_PRIVATE_KEY", key); vi.stubEnv("MONAD_TESTNET_RPC", "https://provider.example/test-secret");
  state.guard = memoryProtection();
  balances(0n); state.nonce.mockResolvedValue(0);
  state.send.mockResolvedValue({ receipt: { status: "success", transactionHash: hash } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("sponsor route", () => {
  it("caps each signed payment at 1 MON on testnet", async () => {
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ txHash: hash, amount: parseEther("1").toString() });
    expect(parseTransaction(state.send.mock.calls[0][1])).toMatchObject({ chainId: 10143, to: recipient, value: parseEther("1"), gas: 21_000n, nonce: 0 });
  });
  it("limits the final top-up to the 4.5 MON balance ceiling", async () => {
    balances(parseEther("4.45"));
    const result = await (await POST(req())).json();
    expect(result.amount).toBe(parseEther("0.05").toString());
  });
  it("validates bodies, addresses and positive bounded needs before RPC work", async () => {
    for (const [i, payload] of [null, [], {}, { ...body(), needWei: null }, { ...body(), needWei: "0" }, { ...body(), needWei: "-1" }, body(recipient, "4.6"), body(sponsor), body(`0x${"0".repeat(40)}`), { ...body(), extra: true }].entries()) {
      expect((await POST(req(payload, `192.0.2.${i + 1}`))).status).toBe(400);
    }
    expect(state.balance).not.toHaveBeenCalled(); expect(state.send).not.toHaveBeenCalled();
    expect((await POST(req("x".repeat(2049), "192.0.2.100"))).status).toBe(413);
  });
  it("keeps 10 MON plus the worst-case transfer gas in reserve", async () => {
    balances(0n, parseEther("11"));
    const response = await POST(req());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "sponsor bakiyesi yetersiz" });
    expect(state.send).not.toHaveBeenCalled();
  });
  it("does not pay or consume grant quota when the account is already funded", async () => {
    balances(parseEther("5"));
    for (let i = 0; i < 6; i++) expect(await (await POST(req(body(), `192.0.2.${i + 1}`))).json()).toEqual({ txHash: null, amount: "0" });
    balances(0n);
    expect((await POST(req())).status).toBe(200); expect(state.send).toHaveBeenCalledOnce();
  });
  it("enforces address limits across IPs and the shared 24-hour budget across addresses", async () => {
    for (let i = 0; i < 5; i++) expect((await POST(req(body(), `192.0.2.${i + 1}`))).status).toBe(200);
    expect((await POST(req(body(), "192.0.2.9"))).status).toBe(429);
    state.guard = memoryProtection(); state.send.mockClear();
    for (let i = 1; i <= 20; i++) {
      const address = `0x${i.toString(16).padStart(40, "0")}`;
      expect((await POST(req(body(address), `198.51.100.${i}`))).status).toBe(200);
    }
    const exhausted = await POST(req(body(`0x${"f".repeat(40)}`), "198.51.100.21"));
    expect(exhausted.status).toBe(429); expect(Number(exhausted.headers.get("retry-after"))).toBeGreaterThan(86_390);
    expect(state.send).toHaveBeenCalledTimes(20);
  });
  it("serializes concurrent requests before reading balances or nonces", async () => {
    let finish!: (value: bigint) => void;
    const pending = new Promise<bigint>((resolve) => { finish = resolve; });
    state.balance.mockImplementationOnce(() => pending);
    const first = POST(req());
    await vi.waitFor(() => expect(state.balance).toHaveBeenCalledOnce());
    const second = await POST(req(body(), "192.0.2.2"));
    expect(second.status).toBe(429); expect(state.nonce).not.toHaveBeenCalled();
    finish(0n);
    expect((await first).status).toBe(200); expect(state.send).toHaveBeenCalledOnce();
  });
  it("holds the lease after an uncertain broadcast, then refuses an outstanding pending nonce", async () => {
    vi.useFakeTimers();
    state.send.mockRejectedValueOnce(new Error("timeout at https://provider.example/test-secret"));
    const response = await POST(req());
    expect(response.status).toBe(502); expect(await response.text()).not.toContain("test-secret");
    expect((await POST(req(body(), "192.0.2.2"))).status).toBe(429);
    await vi.advanceTimersByTimeAsync(120_001);
    state.nonce.mockImplementation(async ({ blockTag }) => blockTag === "pending" ? 1 : 0);
    expect((await POST(req(body(), "192.0.2.3"))).status).toBe(429);
    expect(state.send).toHaveBeenCalledOnce();
  });
  it("does not broadcast when quota reservation or lease renewal fails", async () => {
    state.guard!.lock = vi.fn().mockResolvedValue({ renew: vi.fn().mockRejectedValue(new ApiError(503, "koruma kullanılamıyor")), release: vi.fn().mockResolvedValue(undefined) });
    expect((await POST(req())).status).toBe(503); expect(state.send).not.toHaveBeenCalled();
    state.guard = memoryProtection();
    state.guard.consume = vi.fn().mockRejectedValue(new ApiError(503, "koruma kullanılamıyor"));
    expect((await POST(req())).status).toBe(503); expect(state.send).not.toHaveBeenCalled();
  });
  it("limits malformed requests by IP and hides status-read provider failures", async () => {
    for (let i = 0; i < 8; i++) expect((await POST(req(null))).status).toBe(400);
    expect((await POST(req())).status).toBe(429);
    expect(state.send).not.toHaveBeenCalled();
    state.balance.mockRejectedValueOnce(new Error("test-secret"));
    const response = await GET(new Request("http://localhost/api/fund"));
    expect(response.status).toBe(502); expect(await response.text()).not.toContain("test-secret");
  });
  it("returns public status with no-store and limits repeated status reads", async () => {
    const request = new Request("http://localhost/api/fund");
    const response = await GET(request);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ address: sponsor, reserveWei: parseEther("10").toString(), spendableWei: parseEther("30").toString() });
    for (let i = 1; i < 20; i++) expect((await GET(request)).status).toBe(200);
    expect((await GET(request)).status).toBe(429);
  });
});
