import { createHash, timingSafeEqual } from "node:crypto";
import { watchlistStore, type StoredWatchlist, type WatchlistStore } from "./store";

// Private watchlists, sealed in the browser (lib/kaskad/passkey-keys.ts). The server sees an anonymous
// id, a write token and ciphertext: never a wallet address or what is being watched. Reads need only
// the id (ciphertext is useless without the passkey); writes need the token whose hash the first write
// stored.

const ID = /^[0-9a-f]{64}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
/** 12-byte AES-GCM nonce in base64url. */
const NONCE_LEN = 16;
/** Ciphertext cap: about 20 entries with labels fit in a fraction of this. */
const MAX_CT = 12_000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

const err = (status: number, error: string) => Response.json({ error }, { status });

function limited(req: Request): boolean {
  const ip = (req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) return true;
  list.push(now);
  hits.set(ip, list);
  return false;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function isBlob(x: unknown): x is StoredWatchlist["blob"] {
  const b = x as Partial<StoredWatchlist["blob"]> | null;
  return (
    !!b &&
    b.v === 1 &&
    typeof b.nonce === "string" &&
    b.nonce.length === NONCE_LEN &&
    B64URL.test(b.nonce) &&
    typeof b.ct === "string" &&
    b.ct.length > 0 &&
    b.ct.length <= MAX_CT &&
    B64URL.test(b.ct)
  );
}

/** Store and the stored record behind an authorised write, or the error response. */
async function authorise(store: WatchlistStore, id: string, token: unknown): Promise<{ existing: StoredWatchlist | null } | Response> {
  if (typeof token !== "string" || !ID.test(token)) return err(400, "invalid-request");
  const existing = await store.get(id);
  if (existing && !sameHash(existing.tokenHash, sha256(token))) return err(403, "forbidden");
  return { existing };
}

export async function GET(req: Request) {
  const store = watchlistStore();
  if (!store) return err(503, "unconfigured");
  if (limited(req)) return err(429, "rate-limited");
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!ID.test(id)) return err(400, "invalid-request");
  try {
    const rec = await store.get(id);
    if (!rec) return err(404, "not-found");
    return Response.json({ blob: rec.blob }, { headers: { "cache-control": "no-store" } });
  } catch {
    return err(502, "failed");
  }
}

export async function PUT(req: Request) {
  const store = watchlistStore();
  if (!store) return err(503, "unconfigured");
  if (limited(req)) return err(429, "rate-limited");
  let body: { id?: unknown; token?: unknown; blob?: unknown };
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid-request");
  }
  if (typeof body.id !== "string" || !ID.test(body.id) || !isBlob(body.blob)) return err(400, "invalid-request");
  try {
    const auth = await authorise(store, body.id, body.token);
    if (auth instanceof Response) return auth;
    const { v, nonce, ct } = body.blob;
    await store.set(body.id, { blob: { v, nonce, ct }, tokenHash: sha256(body.token as string) });
    return Response.json({ ok: true });
  } catch {
    return err(502, "failed");
  }
}

export async function DELETE(req: Request) {
  const store = watchlistStore();
  if (!store) return err(503, "unconfigured");
  if (limited(req)) return err(429, "rate-limited");
  let body: { id?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid-request");
  }
  if (typeof body.id !== "string" || !ID.test(body.id)) return err(400, "invalid-request");
  try {
    const auth = await authorise(store, body.id, body.token);
    if (auth instanceof Response) return auth;
    if (auth.existing) await store.delete(body.id);
    return Response.json({ ok: true });
  } catch {
    return err(502, "failed");
  }
}
