"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtUsd, wadToNum } from "@/lib/kaskad/format";
import type { Result } from "./useKaskad";

const axis = { stroke: "#8b92a8", fontSize: 11 };

export function CascadeChart({ r }: { r: Result }) {
  const start = { name: "0", price: wadToNum(r.startPrice), liq: 0 };
  const data = [
    start,
    ...r.log.map((l) => ({
      name: `${l.step}.${l.round + 1}`,
      price: wadToNum(l.priceWad),
      liq: wadToNum(l.liquidatedDebt) / 1e6,
    })),
  ];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#ffffff09" vertical={false} />
        <XAxis dataKey="name" tick={axis} interval="preserveStartEnd" />
        <YAxis yAxisId="p" tick={axis} width={52} domain={["auto", "auto"]} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
        <YAxis yAxisId="l" orientation="right" tick={axis} width={44} tickFormatter={(v) => `${v}M`} />
        <Tooltip
          contentStyle={{ background: "#10131b", border: "1px solid #242a3a", borderRadius: 8 }}
          formatter={(v, k) => (k === "Fiyat" ? `$${Number(v).toFixed(4)}` : `$${Number(v).toFixed(2)}M`)}
          labelFormatter={(l) => `blok.dalga ${l}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="l" dataKey="liq" name="Likide edilen borç" fill="#836ef9" isAnimationActive={false} />
        <Line yAxisId="p" dataKey="price" name="Fiyat" stroke="#ff4d5e" dot={false} strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function CurveChart({
  shocks,
  market,
  rate,
}: {
  shocks: number[];
  market: readonly bigint[];
  rate: readonly bigint[];
}) {
  const data = shocks.map((s, i) => ({
    name: `−%${(s / 100).toLocaleString("tr-TR")}`,
    market: wadToNum(market[i]),
    rate: wadToNum(rate[i]),
  }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#ffffff09" vertical={false} />
        <XAxis dataKey="name" tick={axis} />
        <YAxis tick={axis} width={60} tickFormatter={(v) => fmtUsd(Number(v))} />
        <Tooltip
          contentStyle={{ background: "#10131b", border: "1px solid #242a3a", borderRadius: 8 }}
          formatter={(v) => fmtUsd(Number(v))}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line dataKey="market" name="Anlık havuz · en kötü durum" stroke="#ff4d5e" strokeWidth={2} isAnimationActive={false} />
        <Line dataKey="rate" name="Dış fiyat · gerçekçi" stroke="#3ddc97" strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
