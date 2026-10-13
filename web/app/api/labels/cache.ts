import { ApiError, isRecord } from "@/lib/server/request";
import type { NansenLabel } from "@/lib/chain/exposure";

export interface LabelCache {
  get(key: string): Promise<NansenLabel[] | null>;
  set(key: string, labels: NansenLabel[]): Promise<void>;
}
export const LABEL_TTL_SECONDS = 7 * 24 * 60 * 60;
const unavailable = () => new ApiError(503, "cache-unavailable", 10);

export function parseLabels(value: unknown): NansenLabel[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  if (!value.every((v) => isRecord(v) && typeof v.label === "string" && v.label.length > 0 && v.label.length <= 500 && typeof v.category === "string")) return null;
  return value.map((v) => ({ label: v.label, category: v.category, ...(Array.isArray(v.kind) ? { kind: v.kind.filter((k: unknown): k is string => typeof k === "string") } : {}) }));
}

export function redisLabelCache(url: string, token: string, fetcher: typeof fetch = fetch): LabelCache {
  const command = async (args: (string | number)[]) => {
    try {
      const res = await fetcher(url, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(args), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3_000),
      });
      const body: unknown = await res.json();
      if (!res.ok || !isRecord(body) || body.error || !("result" in body)) throw unavailable();
      return body.result;
    } catch { throw unavailable(); }
  };
  return {
    async get(key) {
      const raw = await command(["GET", key]);
      if (raw === null) return null;
      try {
        const parsed = typeof raw === "string" ? parseLabels(JSON.parse(raw)) : null;
        if (!parsed) throw unavailable();
        return parsed;
      } catch { throw unavailable(); }
    },
    async set(key, labels) {
      if (await command(["SET", key, JSON.stringify(labels), "EX", LABEL_TTL_SECONDS]) !== "OK") throw unavailable();
    },
  };
}

export function memoryLabelCache(): LabelCache {
  const data = new Map<string, { labels: NansenLabel[]; until: number }>();
  return {
    async get(key) {
      const entry = data.get(key);
      if (entry && entry.until > Date.now()) return entry.labels;
      data.delete(key);
      return null;
    },
    async set(key, labels) {
      for (const [k, v] of data) if (v.until <= Date.now()) data.delete(k);
      if (data.size >= 1_500 && !data.has(key)) throw unavailable();
      data.set(key, { labels, until: Date.now() + LABEL_TTL_SECONDS * 1_000 });
    },
  };
}
const local = memoryLabelCache();

/** Production fails closed: cache outages must not turn page visits into paid API bursts. */
export function labelCache(env: Record<string, string | undefined> = process.env): LabelCache {
  const useKv = Boolean(env.KV_REST_API_URL || env.KV_REST_API_TOKEN);
  const url = useKv ? env.KV_REST_API_URL : env.UPSTASH_REDIS_REST_URL;
  const token = useKv ? env.KV_REST_API_TOKEN : env.UPSTASH_REDIS_REST_TOKEN;
  if (url || token) {
    if (!url || !token) throw unavailable();
    try { if (new URL(url).protocol !== "https:") throw unavailable(); } catch { throw unavailable(); }
    return redisLabelCache(url, token);
  }
  if (env.NODE_ENV === "production") throw unavailable();
  return local;
}
