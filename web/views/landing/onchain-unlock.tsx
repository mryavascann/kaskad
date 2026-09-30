"use client";

/**
 * "Why on-chain": a locked, blurred off-chain risk report next to the same analysis as an on-chain
 * block. Scrolling through the section links the two: the connector draws and the block settles in
 * from a ghost outline (scrubbed by ScrollTrigger through `--unlock`, no re-renders). Reduced motion
 * and no-JS: the final, linked state.
 */
import { ArrowUpRight, Blocks, Lock } from "lucide-react";
import { useMotionValueEvent } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useScrollProgress } from "@/motion/use-scroll-progress";
import styles from "./onchain-unlock.module.css";

export type OnchainCopy = {
  report: { name: string; fee: string; tags: readonly string[]; locked: string; body: string; source: string; sourceHref: string };
  block: { name: string; tags: readonly string[]; body: string; proof: string; proofHref: string; rows: readonly [string, string | null][] };
  external: string;
};

export function OnchainUnlock({ copy, missing }: { copy: OnchainCopy; missing: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  // Starts below 0 so the first real reading (often exactly 0) is still a change.
  const progress = useScrollProgress(root, { start: "top 80%", end: "center 45%", initial: -1 });
  useMotionValueEvent(progress, "change", (p) => {
    if (p >= 0) root.current?.style.setProperty("--unlock", p.toFixed(4));
  });

  return (
    <div ref={root} className={cn("grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] lg:gap-0", styles.root)} data-landing-unlock="">
      <article aria-labelledby="report-name" className="relative overflow-hidden rounded-panel border border-line-2 bg-elev-1 p-6">
        <div className="flex items-center justify-between gap-4">
          <h3 id="report-name" className="label-mono text-fg-3">
            {copy.report.name}
          </h3>
          <span className="inline-flex items-center gap-1.5 label-mono text-fg-3">
            <Lock className="size-3.5" aria-hidden />
            {copy.report.locked}
          </span>
        </div>
        <p className="mt-6 font-mono text-metric-lg text-fg-1">{copy.report.fee}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {copy.report.tags.map((tag) => (
            <li key={tag} className="rounded-tag border border-line-3 px-2 py-0.5 label-mono text-fg-2">
              {tag}
            </li>
          ))}
        </ul>
        <div aria-hidden className={cn("mt-6 flex flex-col gap-2.5 select-none", styles.blurred)}>
          <p className="text-body-sm text-fg-2">{copy.report.body}</p>
          {[92, 78, 85, 60].map((w) => (
            <span key={w} className="block h-2 rounded-full bg-line-3" style={{ width: `${w}%` }} />
          ))}
        </div>
        <p className="mt-6 text-caption text-fg-3">
          <a href={copy.report.sourceHref} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 underline decoration-line-strong underline-offset-4 hover:text-fg-1">
            {copy.report.source}
            <ArrowUpRight className="size-3.5" aria-hidden />
            <span className="sr-only">({copy.external})</span>
          </a>
        </p>
      </article>

      <div aria-hidden className="relative flex h-10 items-center justify-center lg:h-auto">
        <span className={cn("absolute h-full w-px bg-monad/70 lg:h-px lg:w-full", styles.link)} />
        <span className={cn("relative grid size-7 place-items-center rounded-full border border-monad/60 bg-bg text-monad-hi", styles.node)}>
          <Blocks className="size-3.5" />
        </span>
      </div>

      <article aria-labelledby="block-name" className={cn("relative overflow-hidden rounded-panel border border-monad/50 bg-elev-1 p-6 shadow-glow-monad", styles.block)}>
        <div className="flex items-center justify-between gap-4">
          <h3 id="block-name" className="label-mono text-monad-hi">
            {copy.block.name}
          </h3>
          <Blocks className="size-4 text-monad-hi" aria-hidden />
        </div>
        {copy.block.rows.some(([, v]) => v === null) ? (
          <p className="mt-6 text-body-sm text-fg-2">{missing}</p>
        ) : (
          <dl className="mt-6 grid grid-cols-3 gap-4">
            {copy.block.rows.map(([label, value]) => (
              <div key={label} className="flex min-w-0 flex-col gap-1">
                <dt className="truncate label-mono text-fg-3">{label}</dt>
                <dd className="font-mono text-body text-fg-1">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <ul className="mt-5 flex flex-wrap gap-1.5">
          {copy.block.tags.map((tag) => (
            <li key={tag} className="rounded-tag border border-monad/45 bg-monad/10 px-2 py-0.5 label-mono text-monad-hi">
              {tag}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-body-sm text-fg-2">{copy.block.body}</p>
        <a
          href={copy.block.proofHref}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-4 inline-flex items-center gap-1.5 text-body-sm text-fg-1 underline decoration-monad/60 underline-offset-4 hover:decoration-monad-hi"
        >
          {copy.block.proof}
          <ArrowUpRight className="size-4 text-fg-3 group-hover:text-fg-1" aria-hidden />
          <span className="sr-only">({copy.external})</span>
        </a>
      </article>
    </div>
  );
}
