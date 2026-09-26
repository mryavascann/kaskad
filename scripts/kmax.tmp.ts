import { createPublicClient, http, encodeFunctionData, decodeFunctionResult } from "viem";
import "./src/lib/env.js";
import { kaskadMCAbi } from "../web/lib/kaskad/abi.js";
const MC = "0x1269A28f29a61FD88c03e652Edd56B7F87bA5a08";
const chains = {
  monad: { c: createPublicClient({ transport: http(process.env.MONAD_TESTNET_RPC!, { timeout: 120_000 }) }), cap: 30_000_000n },
  eth: { c: createPublicClient({ transport: http("http://127.0.0.1:8546", { timeout: 900_000 }) }), cap: 16_777_216n },
};
const ethMem = (b: number) => { const w = Math.ceil(b / 32); return 3 * w + Math.floor(w * w / 512); };
async function tryK(ch: any, s: any, k: number) {
  try {
    const data = encodeFunctionData({ abi: kaskadMCAbi, functionName: "previewMC", args: [s, BigInt(k), 1n] });
    const res = await ch.c.call({ to: MC, data, gas: ch.cap });
    return decodeFunctionResult({ abi: kaskadMCAbi, functionName: "previewMC", data: res.data! }) as any;
  } catch { return null; }
}
const cases = [
  ["syrupUSDC Monad (57)", { assetId: 9, shockBps: 300, maxPositions: 57 }],
  ["USDe Ethereum (63)", { assetId: 14, shockBps: 300, maxPositions: 63 }],
  ["WETH Ethereum (300)", { assetId: 7, shockBps: 2000, maxPositions: 300 }],
  ["kalibre syrupUSDC (2000)", { assetId: 265, shockBps: 300, maxPositions: 2000 }],
] as const;
for (const [name, base] of cases) for (const fb of [10000, 0]) {
  const s = { ...base, steps: 20, maxRoundsPerStep: 3, oracleFeedbackBps: fb };
  const out: string[] = [];
  for (const [cn, ch] of Object.entries(chains)) {
    let lo = 0, hi = 2000, best: any = null;
    while (lo < hi) { const mid = Math.ceil((lo + hi + 1) / 2) > hi ? hi : Math.floor((lo + hi + 1) / 2); const r = await tryK(ch, s, mid); if (r) { lo = mid; best = r; } else hi = mid - 1; }
    if (!best && lo > 0) best = await tryK(ch, s, lo);
    out.push(`${cn}: Kmax=${lo}` + (best ? ` gas=${best.gasUsed} mem=${best.memoryBytes}B ethMemGas=${ethMem(Number(best.memoryBytes))} mean=${(Number(best.meanBadDebt)/1e24).toFixed(1)}M p95=${(Number(best.p95BadDebt)/1e24).toFixed(1)}M worst=${(Number(best.worstBadDebt)/1e24).toFixed(1)}M` : ""));
  }
  console.log(`${name} fb=${fb}\n  ${out.join("\n  ")}`);
}
