import { describe, expect, it, vi } from "vitest";
import { derivePasskeyKeys, open } from "@/lib/kaskad/passkey-keys";
import {
  EMPTY_WATCHLIST,
  WATCHLIST_MAX,
  WatchlistError,
  fetchWatchlist,
  parseWatchlist,
  removeEntry,
  storeWatchlist,
  upsertEntry,
  watchStatus,
} from "./watchlist";

const A = "0x815f5bb257e88b67216a344c7c83a3ea4ee74748";
const B = "0x278AA16c5C8E1D68938A302e809F126863D81dAA";

describe("watchlist entries", () => {
  it("adds, updates in place, removes; addresses are checksummed and unique", () => {
    let list = upsertEntry(EMPTY_WATCHLIST, { address: A, alertDropPct: 5, label: "  whale  " });
    list = upsertEntry(list, { address: B, alertDropPct: 2.345 });
    list = upsertEntry(list, { address: A.toUpperCase().replace("0X", "0x"), alertDropPct: 80 });
    expect(list.entries).toEqual([
      { address: "0x815f5BB257e88b67216a344C7C83a3eA4EE74748", alertDropPct: 50 },
      { address: B, alertDropPct: 2.3 },
    ]);
    expect(removeEntry(list, A).entries.map((e) => e.address)).toEqual([B]);
    expect(() => upsertEntry(list, { address: "0x123", alertDropPct: 5 })).toThrow(WatchlistError);
  });

  it("refuses a 21st address and drops junk from a stored list", () => {
    let list = EMPTY_WATCHLIST;
    for (let i = 1; i <= WATCHLIST_MAX; i++) list = upsertEntry(list, { address: `0x${i.toString(16).padStart(40, "0")}`, alertDropPct: 5 });
    expect(() => upsertEntry(list, { address: A, alertDropPct: 5 })).toThrow(expect.objectContaining({ code: "full" }));
    expect(parseWatchlist({ v: 1, entries: [{ address: A, alertDropPct: 5 }, { address: "nope", alertDropPct: 5 }, { address: B }, { address: A, alertDropPct: 7 }] }).entries).toHaveLength(1);
    expect(parseWatchlist({ v: 2, entries: [] })).toEqual(EMPTY_WATCHLIST);
    expect(parseWatchlist(null)).toEqual(EMPTY_WATCHLIST);
  });

  it("alerts when the position liquidates within the reader's alert drop", () => {
    expect(watchStatus({ kind: "at-drop", drop: 0.0231 }, 5)).toBe("alert");
    expect(watchStatus({ kind: "at-drop", drop: 0.08 }, 5)).toBe("ok");
    expect(watchStatus({ kind: "never" }, 5)).toBe("ok");
    expect(watchStatus({ kind: "liquidatable-now" }, 5)).toBe("liquidatable-now");
    expect(watchStatus(null, 5)).toBe("no-debt");
  });
});

describe("watchlist storage", () => {
  it("sends only the anonymous id, the write token and ciphertext; reads it back", async () => {
    const keys = await derivePasskeyKeys(new Uint8Array(32).fill(3));
    const list = upsertEntry(EMPTY_WATCHLIST, { address: A, alertDropPct: 5, label: "whale" });
    let stored: { id: string; token: string; blob: never } | null = null;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        stored = JSON.parse(String(init.body));
        return Response.json({ ok: true });
      }
      return stored ? Response.json({ blob: stored.blob }) : new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    expect(await fetchWatchlist(keys, fetchImpl)).toEqual(EMPTY_WATCHLIST);
    await storeWatchlist(keys, list, fetchImpl);
    const sent = JSON.stringify(stored);
    expect(sent).not.toMatch(/815f5bb2|whale/i);
    expect(stored!.id).toBe(keys.id);
    expect(stored!.token).toBe(keys.writeToken);
    expect(await open(keys.encrypt, stored!.blob)).toEqual(list);
    expect(await fetchWatchlist(keys, fetchImpl)).toEqual(list);
  });

  it("turns HTTP failures into typed errors", async () => {
    const keys = await derivePasskeyKeys(new Uint8Array(32).fill(4));
    const status = (s: number) => (async () => new Response(null, { status: s })) as unknown as typeof fetch;
    await expect(fetchWatchlist(keys, status(503))).rejects.toMatchObject({ code: "unconfigured" });
    await expect(storeWatchlist(keys, EMPTY_WATCHLIST, status(403))).rejects.toMatchObject({ code: "forbidden" });
    await expect(storeWatchlist(keys, EMPTY_WATCHLIST, status(429))).rejects.toMatchObject({ code: "rate-limited" });
  });
});
