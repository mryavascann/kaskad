import { createHash } from "node:crypto";
import { isIP } from "node:net";

export class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}

export const json = (body: unknown, status = 200, retryAfter?: number) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store", ...(retryAfter ? { "retry-after": String(retryAfter) } : {}) },
});

/** Vercel overwrites x-real-ip. Other hosts must strip client-supplied forwarding headers. */
export function clientKey(req: Request): string {
  const raw = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "";
  const ip = raw.trim().toLowerCase();
  // Collapse IPv4-mapped IPv6 and canonicalize other IPv6 spellings to prevent quota bypass.
  let normalized = isIP(ip) ? ip : "unknown";
  if (isIP(ip) === 6 && !ip.includes("%")) {
    normalized = new URL(`http://[${ip}]`).hostname;
    const mapped = normalized.match(/^\[::ffff:([0-9a-f]+):([0-9a-f]+)\]$/);
    if (mapped) {
      const n = Number.parseInt(mapped[1], 16) * 65536 + Number.parseInt(mapped[2], 16);
      normalized = [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
    }
  } else if (ip.includes("%")) normalized = "unknown";
  return createHash("sha256").update(normalized).digest("hex");
}

/** Reject oversized streamed bodies as well as honest Content-Length headers. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  if (Number(req.headers.get("content-length")) > maxBytes) throw new ApiError(413, "geçersiz istek");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "geçersiz istek");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ApiError(408, "geçersiz istek")), 5_000); });
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new ApiError(413, "geçersiz istek");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "geçersiz istek");
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
