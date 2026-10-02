// Where sealed watchlists live: Upstash Redis over its REST API (Vercel's KV integration sets
// KV_REST_API_URL / KV_REST_API_TOKEN; plain Upstash sets UPSTASH_REDIS_REST_URL / _TOKEN). Without
// one, development keeps them in memory; production answers "unconfigured" rather than losing data.

export type StoredWatchlist = {
  /** Sealed blob as the browser sent it (base64url fields); the server cannot open it. */
  blob: { v: 1; nonce: string; ct: string };
  /** SHA-256 of the write token (hex): later writes must present the same token. */
  tokenHash: string;
};

export type WatchlistStore = {
  get(id: string): Promise<StoredWatchlist | null>;
  set(id: string, value: StoredWatchlist): Promise<void>;
  delete(id: string): Promise<void>;
};

/** Kept 180 days after the last write; the next save extends it. */
const TTL_SECONDS = 180 * 24 * 60 * 60;
const KEY = (id: string) => `kaskad:watchlist:${id}`;

function upstash(url: string, token: string): WatchlistStore {
  const command = async (cmd: (string | number)[]): Promise<unknown> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cmd),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`kv ${res.status}`);
    return ((await res.json()) as { result?: unknown }).result ?? null;
  };
  return {
    async get(id) {
      const raw = await command(["GET", KEY(id)]);
      return typeof raw === "string" ? (JSON.parse(raw) as StoredWatchlist) : null;
    },
    async set(id, value) {
      await command(["SET", KEY(id), JSON.stringify(value), "EX", TTL_SECONDS]);
    },
    async delete(id) {
      await command(["DEL", KEY(id)]);
    },
  };
}

const memory = new Map<string, StoredWatchlist>();
const memoryStore: WatchlistStore = {
  get: async (id) => memory.get(id) ?? null,
  set: async (id, value) => void memory.set(id, value),
  delete: async (id) => void memory.delete(id),
};

/** The configured store, the in-memory one in development, or null (production without KV). */
export function watchlistStore(env: Record<string, string | undefined> = process.env): WatchlistStore | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstash(url, token);
  return env.NODE_ENV === "production" ? null : memoryStore;
}
