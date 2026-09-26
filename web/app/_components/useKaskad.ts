"use client";

import { useEffect, useRef, useState } from "react";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { kaskadAbi } from "@/lib/kaskad/abi";
import { publicClient } from "@/lib/kaskad/burner";
import { DEPLOYMENT } from "@/lib/kaskad/config";

export type Scenario = {
  assetId: number;
  shockBps: number;
  steps: number;
  maxRoundsPerStep: number;
  maxPositions: number;
  oracleFeedbackBps: number;
};

export type RoundLog = {
  step: number;
  round: number;
  liquidations: number;
  priceWad: bigint;
  liquidatedDebt: bigint;
  seized: bigint;
  deficit: bigint;
};

export type Result = {
  totalDebt: bigint;
  totalCollateral: bigint;
  totalLiquidated: bigint;
  totalSeized: bigint;
  badDebt: bigint;
  stuckDebt: bigint;
  startPrice: bigint;
  finalPrice: bigint;
  rounds: number;
  liquidations: number;
  positionsUsed: number;
  gasUsed: bigint;
  memoryBytes: bigint;
  log: readonly RoundLog[];
};

/**
 * Real books run on the v2 engine (KaskadMC: same cascade + inter-block arbitrage recovery,
 * reading Kaskad's books). Calibrated books (id >= 256) run on Kaskad itself; their asset
 * (syrupUSDC) has no recovery, so both engines give the same result there.
 */
export function engineFor(assetId: number) {
  return assetId >= 256 || !DEPLOYMENT.contracts.kaskadMC ? DEPLOYMENT.contracts.kaskad : DEPLOYMENT.contracts.kaskadMC;
}

/** eth_call with the Monad per-tx gas limit, so "preview works" means "fits in one tx". */
async function call30M(functionName: "preview" | "previewCurve", args: readonly unknown[], assetId: number) {
  const data = encodeFunctionData({ abi: kaskadAbi, functionName, args: args as never });
  const res = await publicClient.call({ to: engineFor(assetId), data, gas: 30_000_000n });
  if (!res.data) throw new Error("empty eth_call result");
  return decodeFunctionResult({ abi: kaskadAbi, functionName, data: res.data });
}

export async function previewScenario(s: Scenario): Promise<Result> {
  return (await call30M("preview", [s], s.assetId)) as unknown as Result;
}

export async function previewCurve(s: Scenario, shocks: number[]) {
  const [bad, liq] = (await call30M("previewCurve", [s, shocks], s.assetId)) as unknown as [
    readonly bigint[],
    readonly bigint[],
    bigint,
    bigint,
  ];
  return { bad, liq };
}

/** Debounced free preview; at most ~1 request/s against the RPC. */
export function usePreview(s: Scenario) {
  const key = JSON.stringify(s);
  const [state, setState] = useState<{ key: string; result: Result | null; error: string | null; ms: number }>({
    key: "",
    result: null,
    error: null,
    ms: 0,
  });
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const t0 = performance.now();
      try {
        const result = await previewScenario(JSON.parse(key));
        if (id === seq.current) setState({ key, result, error: null, ms: performance.now() - t0 });
      } catch (e) {
        if (id !== seq.current) return;
        const msg = String((e as Error)?.message ?? e);
        const error = /gas|out of/i.test(msg)
          ? "30M gas sınırı aşıldı: bu çözünürlük tek tx'e sığmıyor."
          : "Önizleme başarısız.";
        setState({ key, result: null, error, ms: 0 });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [key]);

  return { result: state.result, error: state.error, loading: state.key !== key, ms: state.ms };
}
