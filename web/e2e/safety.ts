/**
 * Safety net for every e2e test: no test may send a transaction or spend MON.
 *
 * - POST /api/rpc bodies (single call or batch) are parsed; a forbidden method aborts the request and
 *   is recorded as a violation, which fails the test at teardown (see fixtures.ts).
 * - POST /api/fund (the sponsor top-up) is always aborted and recorded.
 * - Requests to non-local hosts that look like JSON-RPC (a JSON-RPC body, or an RPC-looking host) are
 *   aborted and recorded, so nothing can bypass the local proxy.
 *
 * Pure helpers (`rpcMethods`, `forbiddenMethods`, `isLocalUrl`, `looksLikeRpcHost`) are checked by
 * e2e/safety.spec.ts without a browser.
 */
import type { BrowserContext, Request, Route } from "@playwright/test";

/** Methods that write to the chain. Anything starting with eth_sendRawTransaction is also caught. */
export const FORBIDDEN_METHODS = ["eth_sendRawTransaction", "eth_sendRawTransactionSync", "eth_sendTransaction", "wallet_sendCalls"] as const;

const FORBIDDEN_RE = /eth_sendRawTransaction\w*|eth_sendTransaction|wallet_sendCalls/g;

/**
 * JSON-RPC method names in a request body: a single call or a batch. A body that is not valid JSON
 * falls back to a text scan for the forbidden names (fail closed).
 */
export function rpcMethods(body: string | null | undefined): string[] {
  if (!body) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body.match(FORBIDDEN_RE) ?? [];
  }
  const calls = Array.isArray(parsed) ? parsed : [parsed];
  return calls.map((c) => (c && typeof c === "object" && typeof (c as { method?: unknown }).method === "string" ? (c as { method: string }).method : "")).filter(Boolean);
}

/** True when the body looks like JSON-RPC at all (has a jsonrpc/method field), single or batch. */
export function isJsonRpcBody(body: string | null | undefined): boolean {
  if (!body) return false;
  try {
    const parsed: unknown = JSON.parse(body);
    const calls = Array.isArray(parsed) ? parsed : [parsed];
    return calls.some((c) => c && typeof c === "object" && ("jsonrpc" in c || "method" in c));
  } catch {
    return false;
  }
}

/** The forbidden methods in a body (empty = safe). */
export function forbiddenMethods(body: string | null | undefined): string[] {
  return rpcMethods(body).filter((m) => (FORBIDDEN_METHODS as readonly string[]).includes(m) || m.startsWith("eth_sendRawTransaction"));
}

export function isLocalUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol === "data:" || protocol === "blob:" || protocol === "about:") return true;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1" || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

/** Hosts that are (or front) an EVM RPC. Other external requests (fonts, images) pass through. */
export function looksLikeRpcHost(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return /(^|[.-])rpc([.-]|$)|alchemy|infura|quiknode|quicknode|ankr|drpc|blastapi|chainstack|llamarpc|publicnode|thirdweb|monad\.xyz$/i.test(hostname) || /\/rpc\b/.test(pathname);
  } catch {
    return false;
  }
}

export type Violation = { kind: "send-raw" | "fund" | "external-rpc"; url: string; detail: string };

export type SafetyGuard = {
  /** Things that would have spent MON or bypassed the proxy. Must be empty at the end of a test. */
  violations: Violation[];
  /** Every JSON-RPC method sent to /api/rpc, in order (for assertions such as "an eth_call happened"). */
  rpcMethods: string[];
  /** External RPC-like requests that were aborted (also violations: the browser must use /api/rpc). */
  blockedExternal: string[];
};

/** Installs the routes on a browser context. Call before the first navigation. */
export async function installSafety(context: BrowserContext): Promise<SafetyGuard> {
  const guard: SafetyGuard = { violations: [], rpcMethods: [], blockedExternal: [] };

  await context.route("**/api/rpc", async (route: Route, request: Request) => {
    const body = request.postData();
    guard.rpcMethods.push(...rpcMethods(body));
    const bad = forbiddenMethods(body);
    if (bad.length > 0) {
      guard.violations.push({ kind: "send-raw", url: request.url(), detail: bad.join(", ") });
      await route.abort("blockedbyclient");
      return;
    }
    await route.fallback();
  });

  await context.route("**/api/fund", async (route: Route, request: Request) => {
    if (request.method() === "POST") {
      guard.violations.push({ kind: "fund", url: request.url(), detail: request.postData() ?? "" });
      await route.abort("blockedbyclient");
      return;
    }
    await route.fallback();
  });

  await context.route(
    (url) => !isLocalUrl(url.href),
    async (route: Route, request: Request) => {
      const body = request.method() === "POST" ? request.postData() : null;
      const bad = forbiddenMethods(body);
      if (bad.length > 0) {
        guard.violations.push({ kind: "send-raw", url: request.url(), detail: bad.join(", ") });
        await route.abort("blockedbyclient");
        return;
      }
      if (isJsonRpcBody(body) || looksLikeRpcHost(request.url())) {
        guard.blockedExternal.push(`${request.method()} ${request.url()}`);
        guard.violations.push({ kind: "external-rpc", url: request.url(), detail: request.method() });
        await route.abort("blockedbyclient");
        return;
      }
      await route.fallback();
    },
  );

  return guard;
}
