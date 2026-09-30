"use client";

import { CircleCheck, OctagonAlert } from "lucide-react";
import { animate, m, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { HonestyTag } from "@/design/ui/honesty";
import { cn } from "@/lib/utils";
import { useShouldReduceMotion } from "@/motion/hooks";
import { duration, easing, toSeconds } from "@/motion/tokens";
import { fill, mergeCopy } from "./copy";
import { withFormats, type Formatter } from "./format";
import { StateBox, chartStatus, type StateCopy } from "./frame";
import { gasScale, memoryGasScale, type LimitData } from "./gauge-model";
import { pct, round } from "./geometry";
import { useEnterView } from "./use-enter-view";
import styles from "./viz.module.css";

export type GasGaugeCopy = StateCopy & {
  label: string;
  scaleTag: string;
  monad: string;
  ethereum: string;
  measured: string;
  estimate: string;
  limit: string;
  cap: string;
  fits: string;
  overLimit: string;
  doesntFit: string;
  multiple: string;
  memory: string;
  memoryUsed: string;
  memoryGas: string;
  positions: string;
  summaryMonad: string;
  summaryMonadOver: string;
  summaryEth: string;
  summaryEthOver: string;
};

export const GAS_GAUGE_COPY: GasGaugeCopy = {
  label: "Gas of one transaction",
  scaleTag: "Gas · one shared scale",
  monad: "Monad",
  ethereum: "Ethereum",
  measured: "Measured",
  estimate: "Estimate",
  limit: "Limit",
  cap: "Cap",
  fits: "Fits in one tx",
  overLimit: "Over the per-tx limit",
  doesntFit: "Doesn't fit in one tx",
  multiple: "{value} Monad's gas",
  memory: "Memory · Monad per-tx limit",
  memoryUsed: "{used} of {limit}",
  memoryGas: "Memory gas",
  positions: "{count} positions",
  summaryMonad: "Monad: {gas} gas of its {limit} per-transaction limit, measured; it fits in one transaction.",
  summaryMonadOver: "Monad: {gas} gas, over its {limit} per-transaction limit.",
  summaryEth: "Ethereum, estimated: {gas} gas against its {limit} cap; it fits in one transaction.",
  summaryEthOver: "Ethereum, estimated: {gas} gas against its {limit} cap; it doesn't fit in one transaction.",
  loading: "Loading gas",
  emptyTitle: "No gas figures",
  emptyBody: "The run reported no gas.",
  errorTitle: "Couldn't load the gas figures",
};

type GasGaugeProps = {
  /** `limitFacts(result)` (lib/chain/limits); null while loading. */
  facts: LimitData | null;
  error?: ReactNode;
  errorAction?: ReactNode;
  locale?: string;
  formatGas?: Formatter;
  formatBytes?: Formatter;
  formatInt?: Formatter;
  formatRatio?: Formatter;
  copy?: Partial<GasGaugeCopy>;
  className?: string;
  id?: string;
};

/**
 * One engine run against the per-transaction gas ceiling of both chains, on ONE linear scale: the
 * Monad bar (measured) fills and stops under its 30M limit; the Ethereum bar (an estimate, labelled
 * as such) runs into its 16,777,216 cap and, when it does not fit, carries on past it in red. Both
 * bars grow at the same speed when the gauge scrolls into view. Memory below.
 */
export function GasGauge({ facts, error, errorAction, locale, formatGas, formatBytes, formatInt, formatRatio, copy: copyProp, className, id }: GasGaugeProps) {
  const copy = mergeCopy(GAS_GAUGE_COPY, copyProp);
  const f = withFormats(locale, { gas: formatGas, bytes: formatBytes, int: formatInt, ratio: formatRatio });
  const status = chartStatus(facts, error, facts !== null && !(facts.monad.gas > 0));

  const rootRef = useRef<HTMLElement>(null);
  const entered = useEnterView(rootRef);
  const reduce = useShouldReduceMotion();
  // Gas units drawn so far: both bars grow with it, so they move at the same speed on the same scale.
  const top = facts ? Math.max(facts.monad.gas, facts.ethereum.gasEstimate) : 0;
  const drawn = useMotionValue(top);
  const memory = useMotionValue(1);
  useEffect(() => {
    drawn.jump(top);
  }, [top, drawn]);
  useEffect(() => {
    if (!entered || reduce || !(top > 0)) return;
    drawn.jump(0);
    memory.jump(0);
    const runs = [
      animate(drawn, top, { duration: toSeconds(duration.sceneLong), ease: easing.outQuart }),
      animate(memory, 1, { duration: toSeconds(duration.scene), ease: easing.outExpo, delay: toSeconds(duration.slow) }),
    ];
    return () => runs.forEach((r) => r.stop());
  }, [entered, reduce, top, drawn, memory]);

  if (status !== "ready" || !facts) {
    return (
      <figure ref={rootRef} id={id} data-slot="gas-gauge" aria-label={copy.label} className={cn("flex min-w-0 flex-col gap-4", className)}>
        <StateBox status={status === "ready" ? "loading" : status} className="min-h-64" copy={copy} error={error} errorAction={errorAction} />
      </figure>
    );
  }

  const scale = gasScale(facts);
  const mem = memoryGasScale(facts);
  const { monad, ethereum } = facts;
  const summary = [
    fill(monad.fitsOneTx ? copy.summaryMonad : copy.summaryMonadOver, { gas: f.gas(monad.gas), limit: f.gas(monad.gasLimit) }),
    fill(ethereum.fitsOneTx ? copy.summaryEth : copy.summaryEthOver, { gas: f.gas(ethereum.gasEstimate), limit: f.gas(ethereum.gasCap) }),
  ].join(" ");

  return (
    <figure ref={rootRef} id={id} data-slot="gas-gauge" aria-label={copy.label} className={cn("flex min-w-0 flex-col gap-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="label-mono text-fg-3">{copy.scaleTag}</p>
        <p className="font-mono text-caption text-fg-3">{fill(copy.positions, { count: f.int(facts.positions) })}</p>
      </div>

      <div className="flex flex-col gap-4">
        <GasRow
          name={copy.monad}
          tag={<HonestyTag kind="measured">{copy.measured}</HonestyTag>}
          value={monad.gas}
          ceiling={monad.gasLimit}
          ceilingLabel={copy.limit}
          fits={monad.fitsOneTx}
          status={monad.fitsOneTx ? copy.fits : copy.overLimit}
          at={scale.at}
          drawn={drawn}
          fillClass="bg-monad"
          f={f}
        />
        <GasRow
          name={copy.ethereum}
          tag={<HonestyTag kind="estimate">{copy.estimate}</HonestyTag>}
          value={ethereum.gasEstimate}
          ceiling={ethereum.gasCap}
          ceilingLabel={copy.cap}
          fits={ethereum.fitsOneTx}
          status={ethereum.fitsOneTx ? copy.fits : copy.doesntFit}
          extra={fill(copy.multiple, { value: f.ratio(ethereum.multipleOfMonad) })}
          at={scale.at}
          drawn={drawn}
          fillClass="bg-fg-3"
          f={f}
        />
        <div aria-hidden className="@container relative ml-0 h-[1lh] text-label sm:ml-28">
          {scale.ticks.map((t, i) => (
            <span
              key={t}
              className={cn("label-mono absolute top-0 whitespace-nowrap text-fg-3", i % 2 === 1 && "@max-[20rem]:hidden")}
              style={{ left: pct(scale.at(t)), transform: `translateX(-${pct(scale.at(t))})` }}
            >
              {f.gas(t)}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="label-mono text-fg-3">{copy.memory}</span>
            <span className="font-mono text-caption whitespace-nowrap text-fg-2">
              {fill(copy.memoryUsed, { used: f.bytes(monad.memoryBytes), limit: f.bytes(monad.memoryLimit) })}
            </span>
          </p>
          <Bar share={monad.memoryBytes / monad.memoryLimit} progress={memory} className="bg-monad" />
        </div>
        <div className="flex flex-col gap-2">
          <p className="label-mono text-fg-3">{copy.memoryGas}</p>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 font-mono text-caption">
            <span className="text-fg-2">{copy.monad}</span>
            <Bar share={mem.at(monad.memoryGas)} progress={memory} className="bg-monad" />
            <span className="text-right text-fg-1">{f.gas(monad.memoryGas)}</span>
            <span className="text-fg-2">{copy.ethereum}</span>
            <Bar share={mem.at(ethereum.memoryGas)} progress={memory} className="bg-fg-3" />
            <span className="text-right text-fg-1">{f.gas(ethereum.memoryGas)}</span>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

function GasRow({
  name,
  tag,
  value,
  ceiling,
  ceilingLabel,
  fits,
  status,
  extra,
  at,
  drawn,
  fillClass,
  f,
}: {
  name: string;
  tag: ReactNode;
  value: number;
  ceiling: number;
  ceilingLabel: string;
  fits: boolean;
  status: string;
  extra?: string;
  at: (gas: number) => number;
  drawn: MotionValue<number>;
  fillClass: string;
  f: ReturnType<typeof withFormats>;
}) {
  const under = Math.min(value, ceiling);
  const over = Math.max(0, value - ceiling);
  const underScale = useTransform(drawn, (g) => (under > 0 ? round(Math.min(1, Math.max(0, g) / under), 4) : 0));
  const overScale = useTransform(drawn, (g) => (over > 0 ? round(Math.min(1, Math.max(0, g - ceiling) / over), 4) : 0));
  const StatusIcon = fits ? CircleCheck : OctagonAlert;
  return (
    <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
      <div className="flex items-center gap-2 whitespace-nowrap sm:flex-col sm:items-start sm:gap-1">
        <span className="text-body-sm font-medium text-fg-1">{name}</span>
        {tag}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-caption">
          <span className="font-mono">
            <span className={fits ? "text-fg-1" : "text-liq-hi"}>{f.gas(value)}</span>
            <span className="text-fg-3">
              {" / "}
              {f.gas(ceiling)}
            </span>
            {extra && <span className="ml-3 text-fg-3">{extra}</span>}
          </span>
          <span className={cn("inline-flex items-center gap-1.5", fits ? "text-safe" : "text-liq-hi")}>
            <StatusIcon aria-hidden className="size-3.5" />
            {status}
          </span>
        </p>
        <div aria-hidden className="relative h-7">
          <span className="absolute inset-x-0 bottom-0 h-2 rounded-[2px] bg-line/70" />
          <m.span
            className={cn("absolute bottom-0 left-0 h-2 origin-left rounded-l-[2px]", fillClass, over === 0 && "rounded-r-[2px]")}
            style={{ width: pct(at(under)), scaleX: underScale }}
          />
          {over > 0 && (
            <m.span
              data-slot="overflow"
              className={cn("absolute bottom-0 h-2 origin-left rounded-r-[2px] bg-liq", styles.overflow)}
              style={{ left: pct(at(ceiling)), width: pct(at(value) - at(ceiling)), scaleX: overScale }}
            />
          )}
          {/* The per-tx ceiling of this chain. */}
          <span className={cn("absolute top-0 -bottom-1 w-px -translate-x-1/2", fits ? "bg-fg-2" : "bg-liq-hi")} style={{ left: pct(at(ceiling)) }} />
          <span
            className={cn("label-mono absolute top-0 whitespace-nowrap", fits ? "text-fg-3" : "text-liq-hi")}
            style={at(ceiling) > 0.8 ? { right: pct(1 - at(ceiling)), marginRight: "0.4rem" } : { left: pct(at(ceiling)), marginLeft: "0.4rem" }}
          >
            {ceilingLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function Bar({ share, progress, className }: { share: number; progress: MotionValue<number>; className: string }) {
  return (
    <span aria-hidden className="relative block h-1.5 w-full rounded-[2px] bg-line/70">
      <m.span
        className={cn("absolute inset-y-0 left-0 block origin-left rounded-[2px]", className)}
        style={{ width: `max(1px, ${pct(Math.min(1, Math.max(0, share)))})`, scaleX: progress }}
      />
    </span>
  );
}
