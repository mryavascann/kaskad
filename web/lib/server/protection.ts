import { randomUUID } from "node:crypto";
import { ApiError } from "./request";

export type Limit = { key: string; max: number; windowMs: number; cost?: number };
export type Lease = { renew(): Promise<void>; release(): Promise<void> };
export interface Protection {
  consume(limits: Limit[]): Promise<void>;
  lock(key: string): Promise<Lease>;
}
const PREFIX = "kaskad:protection:v1:";
const LEASE_MS = 120_000;

// One atomic decision for all counters, with expiry measured by Redis, not instance clocks.
export const LIMIT_SCRIPT = `
local retry = 0
for i, key in ipairs(KEYS) do
  local n = tonumber(redis.call('GET', key) or '0')
  local cost = tonumber(ARGV[(i-1)*3+1])
  local cap = tonumber(ARGV[(i-1)*3+2])
  if n + cost > cap then
    retry = math.max(retry, redis.call('PTTL', key), 1)
  end
end
if retry > 0 then return retry end
for i, key in ipairs(KEYS) do
  local cost = tonumber(ARGV[(i-1)*3+1])
  local n = redis.call('INCRBY', key, cost)
  if n == cost then redis.call('PEXPIRE', key, ARGV[(i-1)*3+3]) end
end
return 0`;
const RENEW = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end";
const RELEASE = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
const unavailable = () => new ApiError(503, "koruma kullanılamıyor", 10);
const limited = (ms: number) => new ApiError(429, "çok fazla istek", Math.max(1, Math.ceil(ms / 1000)));

export function redisProtection(url: string, token: string, fetcher: typeof fetch = fetch): Protection {
  const command = async (args: (string | number)[]): Promise<unknown> => {
    try {
      const response = await fetcher(url, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(args), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) throw unavailable();
      const body = await response.json();
      if (!body || typeof body !== "object" || body.error || !("result" in body)) throw unavailable();
      return body.result;
    } catch { throw unavailable(); }
  };
  return {
    async consume(limits) {
      const retry = await command(["EVAL", LIMIT_SCRIPT, limits.length, ...limits.map((l) => PREFIX + l.key), ...limits.flatMap((l) => [l.cost ?? 1, l.max, l.windowMs])]);
      if (typeof retry !== "number" || !Number.isSafeInteger(retry) || retry < 0) throw unavailable();
      if (retry) throw limited(retry);
    },
    async lock(key) {
      const name = PREFIX + key;
      const token = randomUUID();
      const result = await command(["SET", name, token, "NX", "PX", LEASE_MS]);
      if (result === null) throw new ApiError(429, "sponsor meşgul", 2);
      if (result !== "OK") throw unavailable();
      return {
        async renew() {
          if (await command(["EVAL", RENEW, 1, name, token, LEASE_MS]) !== 1) throw unavailable();
        },
        async release() { await command(["EVAL", RELEASE, 1, name, token]); },
      };
    },
  };
}

/** Bounded local fallback for development/tests only. Production always requires Redis. */
export function memoryProtection(): Protection {
  const counters = new Map<string, { value: number; until: number }>();
  const locks = new Map<string, { token: string; until: number }>();
  return {
    async consume(limits) {
      const now = Date.now();
      for (const [key, counter] of counters) if (counter.until <= now) counters.delete(key);
      let retry = 0;
      for (const l of limits) {
        const c = counters.get(l.key);
        if ((c?.value ?? 0) + (l.cost ?? 1) > l.max) retry = Math.max(retry, (c?.until ?? now + l.windowMs) - now);
      }
      if (retry) throw limited(retry);
      if (counters.size + limits.filter((l) => !counters.has(l.key)).length > 5_000) throw unavailable();
      for (const l of limits) {
        const old = counters.get(l.key);
        counters.set(l.key, { value: (old?.value ?? 0) + (l.cost ?? 1), until: old?.until ?? now + l.windowMs });
      }
    },
    async lock(key) {
      for (const [name, lock] of locks) if (lock.until <= Date.now()) locks.delete(name);
      if (locks.has(key)) throw new ApiError(429, "sponsor meşgul", 2);
      if (locks.size >= 100) throw unavailable();
      const token = randomUUID();
      locks.set(key, { token, until: Date.now() + LEASE_MS });
      return {
        async renew() {
          const lock = locks.get(key);
          if (lock?.token !== token || lock.until <= Date.now()) throw unavailable();
          lock.until = Date.now() + LEASE_MS;
        },
        async release() { if (locks.get(key)?.token === token) locks.delete(key); },
      };
    },
  };
}
const local = memoryProtection();

export function protection(env: Record<string, string | undefined> = process.env): Protection {
  const useKv = Boolean(env.KV_REST_API_URL || env.KV_REST_API_TOKEN);
  const url = useKv ? env.KV_REST_API_URL : env.UPSTASH_REDIS_REST_URL;
  const token = useKv ? env.KV_REST_API_TOKEN : env.UPSTASH_REDIS_REST_TOKEN;
  if (url || token) {
    // Fail closed for partially configured or non-TLS remote stores, including development.
    if (!url || !token) throw unavailable();
    try { if (new URL(url).protocol !== "https:") throw unavailable(); } catch { throw unavailable(); }
    return redisProtection(url, token);
  }
  if (env.NODE_ENV === "production") throw unavailable();
  return local;
}
