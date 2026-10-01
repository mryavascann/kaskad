// Testnet JSON-RPC proxy: the browser never sees the Alchemy key. Only the methods the app
// needs are forwarded, with a per-IP rate limit.
import { gzipSync } from "node:zlib";

const ALLOWED = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_sendRawTransaction",
  "eth_sendRawTransactionSync",
]);
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 60; // ~6 req/s per IP; the UI itself stays under ~1/s
const hits = new Map<string, number[]>();

type RpcReq = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };

export async function POST(req: Request) {
  const rpc = process.env.MONAD_TESTNET_RPC;
  if (!rpc) return Response.json({ error: "rpc yapılandırılmamış" }, { status: 503 });

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) return Response.json({ error: "çok fazla istek" }, { status: 429 });
  list.push(now);
  hits.set(ip, list);

  let body: RpcReq | RpcReq[];
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "geçersiz istek" }, { status: 400 });
  }
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > 20) return Response.json({ error: "geçersiz batch" }, { status: 400 });
  for (const c of calls) {
    if (typeof c.method !== "string" || !ALLOWED.has(c.method))
      return Response.json(
        { jsonrpc: "2.0", id: c.id ?? null, error: { code: -32601, message: "method not allowed" } },
        { status: 200 },
      );
  }

  const upstream = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await upstream.text();
  // `next start` does not compress route-handler responses (Lighthouse flagged a 17 KiB eth_call
  // result as uncompressed), so large bodies are gzipped here when the client accepts it. Vercel's
  // edge leaves an already encoded body as it is.
  if (text.length >= GZIP_MIN_BYTES && acceptsGzip(req.headers.get("accept-encoding"))) {
    return new Response(gzipSync(text), {
      status: upstream.status,
      headers: { "content-type": "application/json", "content-encoding": "gzip", vary: "Accept-Encoding" },
    });
  }
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json", vary: "Accept-Encoding" },
  });
}

/** Below this a gzip header and frame cost about as much as they save. */
const GZIP_MIN_BYTES = 1_024;

/** `gzip` listed in Accept-Encoding without `q=0`. */
function acceptsGzip(header: string | null): boolean {
  return (header ?? "").split(",").some((part) => {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (name.trim() !== "gzip" && name.trim() !== "*") return false;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return q === undefined || Number(q.slice(2)) > 0;
  });
}
