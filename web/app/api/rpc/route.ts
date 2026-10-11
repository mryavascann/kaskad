// Testnet-only RPC relay. See lib/server/rpc-policy.ts for destination/method validation.
import { gzipSync } from "node:zlib";
import { ApiError, clientKey, json, readJson } from "@/lib/server/request";
import { protection } from "@/lib/server/protection";
import { RPC_BODY_LIMIT, safeRpcResult, validateRpc } from "@/lib/server/rpc-policy";

export async function POST(req: Request) {
  const rpc = process.env.MONAD_TESTNET_RPC;
  if (!rpc) return json({ error: "rpc yapılandırılmamış" }, 503);
  try {
    const guard = protection();
    const key = clientKey(req);
    // Counts even malformed requests before parsing their bodies.
    await guard.consume([{ key: `rpc:requests:${key}`, max: 60, windowMs: 10_000 }]);
    const body = await readJson(req, RPC_BODY_LIMIT);
    const calls = validateRpc(body);
    if (!calls) return json({ error: "geçersiz RPC isteği" }, 400);
    // Batch items consume quota individually; envelopes cannot multiply the allowance.
    await guard.consume([{ key: `rpc:calls:${key}`, max: 180, windowMs: 10_000, cost: calls.length }]);
    const upstream = await fetch(rpc, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(Array.isArray(body) ? calls : calls[0]),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok) return json({ error: "RPC geçici olarak kullanılamıyor" }, upstream.status === 429 ? 429 : 502, 5);
    const value: unknown = await upstream.json();
    const safe = Array.isArray(value) ? value.map(safeRpcResult) : safeRpcResult(value);
    const text = JSON.stringify(safe);
    const headers = { "content-type": "application/json", "cache-control": "no-store", vary: "Accept-Encoding" };
    if (text.length >= GZIP_MIN_BYTES && acceptsGzip(req.headers.get("accept-encoding"))) {
      return new Response(gzipSync(text), { headers: { ...headers, "content-encoding": "gzip" } });
    }
    return new Response(text, { headers });
  } catch (error) {
    return error instanceof ApiError ? json({ error: error.message }, error.status, error.retryAfter) : json({ error: "RPC geçici olarak kullanılamıyor" }, 502);
  }
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
