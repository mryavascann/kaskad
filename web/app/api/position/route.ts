import { createPublicClient, getAddress, http, isAddress, type PublicClient } from "viem";
import { monad } from "viem/chains";
import { fetchUserPosition } from "@/lib/kaskad/aave";

// Read-only Aave position lookup on Monad MAINNET. The RPC key stays on the server.
const hits = new Map<string, number[]>();

export async function GET(req: Request) {
  const rpc = process.env.MONAD_MAINNET_RPC;
  if (!rpc) return Response.json({ error: "mainnet RPC yapılandırılmamış" }, { status: 503 });
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(address, { strict: false })) return Response.json({ error: "geçersiz adres" }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 20) return Response.json({ error: "çok fazla istek" }, { status: 429 });
  list.push(now);
  hits.set(ip, list);

  try {
    const client = createPublicClient({ chain: monad, transport: http(rpc, { timeout: 20_000 }) }) as PublicClient;
    return Response.json(await fetchUserPosition(client, getAddress(address)));
  } catch {
    return Response.json({ error: "mainnet okuması başarısız" }, { status: 502 });
  }
}
