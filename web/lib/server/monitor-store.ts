import { parseState, type State } from "./monitor-checks";
import { redisProtection, type Lease } from "./protection";

export interface MonitorStore {
  acquire(): Promise<Lease>;
  read(): Promise<State | undefined>;
  write(state: State): Promise<void>;
}

const KEY = "kaskad:monitor:vercel:v1";
export function monitorStore(env: Record<string, string | undefined>, fetcher: typeof fetch): MonitorStore {
  const useKv = Boolean(env.KV_REST_API_URL || env.KV_REST_API_TOKEN);
  const url = useKv ? env.KV_REST_API_URL : env.UPSTASH_REDIS_REST_URL;
  const token = useKv ? env.KV_REST_API_TOKEN : env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || new URL(url).protocol !== "https:") throw new Error("Monitor store unavailable");
  const guard = redisProtection(url, token, fetcher);
  const command = async (args: (string | number)[]) => {
    const response = await fetcher(url, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(args), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error("Monitor store unavailable");
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || "error" in body || !("result" in body)) throw new Error("Monitor store unavailable");
    return body.result;
  };
  return {
    async acquire() {
      const lease = await guard.lock("cloud-monitor");
      try { await guard.consume([{ key: "cloud-monitor-frequency", max: 1, windowMs: 60_000 }]); }
      catch (error) { await lease.release(); throw error; }
      return lease;
    },
    async read() {
      const result = await command(["GET", KEY]);
      if (result === null) return undefined;
      if (typeof result !== "string") throw new Error("Monitor state invalid");
      return parseState(JSON.parse(result));
    },
    async write(state) {
      if (await command(["SET", KEY, JSON.stringify(parseState(state)), "EX", 60 * 24 * 60 * 60]) !== "OK") {
        throw new Error("Monitor state unavailable");
      }
    },
  };
}
