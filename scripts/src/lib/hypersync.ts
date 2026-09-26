import { createRequire } from "node:module";
import { requireEnv } from "./env.js";

/**
 * Minimal HyperSync log fetcher.
 *
 * Prefers the official @envio-dev/hypersync-client (native napi binding). That package ships
 * no Windows binary (targets: linux/darwin only), so on win32 — or whenever the binding fails
 * to load — we speak HyperSync's JSON HTTP API directly (POST {url}/query), which is the same
 * endpoint the client uses with serializationFormat=Json. Both paths paginate on next_block
 * until archive height is reached.
 */

export const HYPERSYNC_URL = "https://monad.hypersync.xyz";

export interface LogRow {
  blockNumber: number;
  topics: (string | null)[];
}

export interface LogQuery {
  address: string[];
  topic0: string;
  fromBlock: number;
}

export interface FetchResult {
  logs: LogRow[];
  archiveHeight: number;
  pages: number;
  transport: "native-client" | "http-json";
}

type Progress = (info: { nextBlock: number; archiveHeight: number; logs: number; pages: number }) => void;

export async function fetchLogs(q: LogQuery, onProgress?: Progress): Promise<FetchResult> {
  const native = tryLoadNative();
  if (native) {
    try {
      return await fetchNative(native, q, onProgress);
    } catch (e) {
      console.warn(`[hypersync] native client failed (${(e as Error).message}); falling back to HTTP JSON API`);
    }
  }
  return fetchHttp(q, onProgress);
}

// ---------------------------------------------------------------------------------------------

type NativeModule = typeof import("@envio-dev/hypersync-client");

function tryLoadNative(): NativeModule | null {
  try {
    const require = createRequire(import.meta.url);
    return require("@envio-dev/hypersync-client") as NativeModule;
  } catch (e) {
    const msg = (e as Error).message.split("\n")[0];
    console.log(`[hypersync] native client unavailable on ${process.platform} (${msg.slice(0, 80)}...) -> using HTTP JSON API`);
    return null;
  }
}

async function fetchNative(mod: NativeModule, q: LogQuery, onProgress?: Progress): Promise<FetchResult> {
  const client = new mod.HypersyncClient({ url: HYPERSYNC_URL, apiToken: requireEnv("ENVIO_API_TOKEN") });
  const logs: LogRow[] = [];
  let from = q.fromBlock;
  let pages = 0;
  let archiveHeight = await client.getHeight();
  for (;;) {
    const res = await client.get({
      fromBlock: from,
      logs: [{ address: q.address, topics: [[q.topic0]] }],
      fieldSelection: { log: ["BlockNumber", "Topic0", "Topic1", "Topic2", "Topic3"] },
    });
    pages++;
    for (const l of res.data.logs) logs.push({ blockNumber: l.blockNumber ?? 0, topics: l.topics.map((t) => t ?? null) });
    archiveHeight = res.archiveHeight ?? archiveHeight;
    onProgress?.({ nextBlock: res.nextBlock, archiveHeight, logs: logs.length, pages });
    if (res.nextBlock >= archiveHeight || res.nextBlock <= from) break;
    from = res.nextBlock;
  }
  return { logs, archiveHeight, pages, transport: "native-client" };
}

// ---------------------------------------------------------------------------------------------

interface HttpLog {
  block_number?: number;
  topic0?: string | null;
  topic1?: string | null;
  topic2?: string | null;
  topic3?: string | null;
}
interface HttpResponse {
  data: { logs?: HttpLog[] }[];
  archive_height: number | null;
  next_block: number;
}

async function postQuery(body: unknown, attempt = 0): Promise<HttpResponse> {
  const res = await fetch(`${HYPERSYNC_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireEnv("ENVIO_API_TOKEN")}` },
    body: JSON.stringify(body),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 8) throw new Error(`HyperSync HTTP ${res.status} after retries`);
    await sleep(Math.min(8000, 500 * 2 ** attempt));
    return postQuery(body, attempt + 1);
  }
  if (!res.ok) throw new Error(`HyperSync HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as HttpResponse;
}

async function fetchHttp(q: LogQuery, onProgress?: Progress): Promise<FetchResult> {
  const logs: LogRow[] = [];
  let from = q.fromBlock;
  let pages = 0;
  let archiveHeight = 0;
  for (;;) {
    const res = await postQuery({
      from_block: from,
      logs: [{ address: q.address, topics: [[q.topic0]] }],
      field_selection: { log: ["block_number", "topic0", "topic1", "topic2", "topic3"] },
    });
    pages++;
    for (const batch of res.data) {
      for (const l of batch.logs ?? []) {
        logs.push({ blockNumber: l.block_number ?? 0, topics: [l.topic0 ?? null, l.topic1 ?? null, l.topic2 ?? null, l.topic3 ?? null] });
      }
    }
    archiveHeight = res.archive_height ?? archiveHeight;
    onProgress?.({ nextBlock: res.next_block, archiveHeight, logs: logs.length, pages });
    if (res.next_block >= archiveHeight || res.next_block <= from) break;
    from = res.next_block;
  }
  return { logs, archiveHeight, pages, transport: "http-json" };
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
