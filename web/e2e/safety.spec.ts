/**
 * Self-check of the safety net. The parser tests need no browser; the route tests serve a blank page
 * from a route (nothing reaches the dev server) and check that a raw-transaction call, a funding POST
 * and an external RPC call are all aborted and recorded.
 */
import { expect, test } from "@playwright/test";
import { forbiddenMethods, installSafety, isJsonRpcBody, isLocalUrl, looksLikeRpcHost, rpcMethods } from "./safety";

const call = (method: string, id = 1) => ({ jsonrpc: "2.0", id, method, params: [] });

test.describe("safety: body parser", () => {
  test("single calls", () => {
    expect(rpcMethods(JSON.stringify(call("eth_call")))).toEqual(["eth_call"]);
    expect(forbiddenMethods(JSON.stringify(call("eth_call")))).toEqual([]);
    expect(forbiddenMethods(JSON.stringify(call("eth_sendRawTransaction")))).toEqual(["eth_sendRawTransaction"]);
    expect(forbiddenMethods(JSON.stringify(call("eth_sendRawTransactionSync")))).toEqual(["eth_sendRawTransactionSync"]);
    expect(forbiddenMethods(JSON.stringify(call("eth_sendTransaction")))).toEqual(["eth_sendTransaction"]);
  });

  test("batches", () => {
    const batch = [call("eth_blockNumber", 1), call("eth_call", 2), call("eth_sendRawTransactionSync", 3)];
    expect(rpcMethods(JSON.stringify(batch))).toEqual(["eth_blockNumber", "eth_call", "eth_sendRawTransactionSync"]);
    expect(forbiddenMethods(JSON.stringify(batch))).toEqual(["eth_sendRawTransactionSync"]);
    expect(forbiddenMethods(JSON.stringify([call("eth_call"), call("eth_getBalance")]))).toEqual([]);
    expect(forbiddenMethods("[]")).toEqual([]);
  });

  test("empty, odd and broken bodies fail closed", () => {
    expect(forbiddenMethods(null)).toEqual([]);
    expect(forbiddenMethods("")).toEqual([]);
    expect(forbiddenMethods("null")).toEqual([]);
    expect(forbiddenMethods(JSON.stringify({ method: 42 }))).toEqual([]);
    // Truncated JSON that still names the method is caught by the text scan.
    expect(forbiddenMethods('[{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0x')).toEqual(["eth_sendRawTransaction"]);
    expect(forbiddenMethods("not json at all")).toEqual([]);
  });

  test("JSON-RPC detection and hosts", () => {
    expect(isJsonRpcBody(JSON.stringify(call("eth_chainId")))).toBe(true);
    expect(isJsonRpcBody(JSON.stringify([call("eth_chainId")]))).toBe(true);
    expect(isJsonRpcBody(JSON.stringify({ address: "0x0" }))).toBe(false);
    expect(isJsonRpcBody("nope")).toBe(false);
    expect(isLocalUrl("http://localhost:3000/api/rpc")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1:3100/")).toBe(true);
    expect(isLocalUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isLocalUrl("https://testnet-rpc.monad.xyz")).toBe(false);
    expect(looksLikeRpcHost("https://testnet-rpc.monad.xyz")).toBe(true);
    expect(looksLikeRpcHost("https://monad-testnet.g.alchemy.com/v2/key")).toBe(true);
    expect(looksLikeRpcHost("https://fonts.gstatic.com/s/inter.woff2")).toBe(false);
    expect(looksLikeRpcHost("https://testnet.monadscan.com/tx/0x1")).toBe(false);
  });
});

test.describe("safety: routes", () => {
  const ORIGIN = "http://localhost:3000";

  test("aborts raw sends, funding and external RPC, lets reads through", async ({ context, page }) => {
    // Serve everything under this origin from routes: nothing reaches a real server. Registered before
    // the safety net, because the last registered route runs first.
    await context.route(`${ORIGIN}/api/**`, (r) => r.fulfill({ contentType: "application/json", body: '{"jsonrpc":"2.0","id":1,"result":"0x1"}' }));
    await page.route(`${ORIGIN}/__safety`, (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>safety</title>" }));
    const guard = await installSafety(context);
    await page.goto(`${ORIGIN}/__safety`);

    const post = (url: string, body: unknown) =>
      page.evaluate(
        async ([u, b]) => {
          // text/plain keeps the cross-origin call a simple request (no preflight to intercept).
          try {
            const res = await fetch(u as string, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(b) });
            return `status ${res.status}`;
          } catch {
            return "blocked";
          }
        },
        [url, body],
      );

    expect(await post("/api/rpc", call("eth_call"))).toBe("status 200");
    expect(await post("/api/rpc", call("eth_sendRawTransactionSync"))).toBe("blocked");
    expect(await post("/api/rpc", [call("eth_blockNumber"), call("eth_sendRawTransaction", 2)])).toBe("blocked");
    expect(await post("/api/fund", { address: "0x0000000000000000000000000000000000000001" })).toBe("blocked");
    expect(await post("https://testnet-rpc.monad.xyz/", call("eth_blockNumber"))).toBe("blocked");

    expect(guard.rpcMethods).toEqual(["eth_call", "eth_sendRawTransactionSync", "eth_blockNumber", "eth_sendRawTransaction"]);
    expect(guard.violations.map((v) => v.kind)).toEqual(["send-raw", "send-raw", "fund", "external-rpc"]);
  });
});
