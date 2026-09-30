/**
 * Static frame of the hero scene, without WebGL: for reduced motion, devices without (fast) WebGL,
 * and as the placeholder the canvas cross-fades over. Same model, same camera, same colors as the
 * scene, so it shows the same data-true row (count, heights, outcomes at `progress`).
 * Server-safe: no client hooks (`useId` works in Server Components), no three.js.
 */
import { useId, type CSSProperties } from "react";
import { hex } from "@/design/tokens";
import { cn } from "@/lib/utils";
import styles from "./hero-poster.module.css";
import { buildHeroModel, poseAt, type HeroPosition } from "./model";
import { FACE_SHADES, FOG_LEVELS, fogged, fogLevel, posterFrame, type PosterFrame } from "./poster-geometry";
import { BACKDROP, FRAMINGS, type Framing } from "./stage";

export type HeroPosterProps = {
  /** Classified positions (`heroFromClassification`); absent: the neutral loading row. */
  positions?: readonly HeroPosition[] | null;
  /**
   * Timeline progress to draw. Default 1: the final state, every outcome visible (what reduced
   * motion shows). The placeholder under the canvas uses the canvas' current progress.
   */
  progress?: number;
  /** Dominoes in the neutral row (the landing passes the book's real position count). */
  placeholderCount?: number;
  className?: string;
};

export function HeroPoster({ positions, progress = 1, placeholderCount, className }: HeroPosterProps) {
  const id = useId();
  const model = buildHeroModel(positions, { placeholderCount });
  const angles = poseAt(model, progress);
  return (
    <div aria-hidden data-hero-poster="" data-state={model.neutral ? "neutral" : "data"} className={cn(styles.stage, className)}>
      {(["wide", "tall"] as const).map((name) => {
        const framing = FRAMINGS[name];
        return (
          <div key={name} className={cn(styles.frame, styles[name])} style={frameStyle(framing)}>
            <PosterSvg frame={posterFrame(model, angles, progress, framing)} id={`${id}${name}`} />
          </div>
        );
      })}
    </div>
  );
}

const frameStyle = (framing: Framing) =>
  ({ "--aspect": framing.aspect, "--align-x": framing.alignX, "--align-y": framing.alignY }) as CSSProperties;

const FACE_KINDS = ["broad", "narrow", "top"] as const;

function Backdrop({ id }: { id: string }) {
  const ellipse = (key: "haze" | "glow", color: string) => {
    const g = BACKDROP[key];
    return (
      <radialGradient
        id={`${id}-${key}`}
        cx={g.cx}
        cy={g.cy}
        r={g.rx}
        gradientTransform={`translate(${g.cx} ${g.cy}) scale(1 ${Math.round((g.ry / g.rx) * 1e4) / 1e4}) translate(${-g.cx} ${-g.cy})`}
      >
        <stop offset="0" stopColor={color} stopOpacity={g.alpha} />
        <stop offset={g.stop} stopColor={color} stopOpacity="0" />
      </radialGradient>
    );
  };
  return (
    <>
      {ellipse("haze", hex.monad)}
      {ellipse("glow", hex.liq)}
    </>
  );
}

function PosterSvg({ frame, id }: { frame: PosterFrame; id: string }) {
  const face = (kind: (typeof FACE_KINDS)[number], fog: number) => `url(#${id}-${kind}-${fogLevel(fog)})`;
  return (
    <svg viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="none" focusable="false">
      <defs>
        <Backdrop id={id} />
        {FACE_KINDS.flatMap((kind) =>
          Array.from({ length: FOG_LEVELS }, (_, level) => {
            const fog = level / (FOG_LEVELS - 1);
            return (
              <linearGradient key={`${kind}${level}`} id={`${id}-${kind}-${level}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={fogged(FACE_SHADES[kind][0], fog)} />
                <stop offset="1" stopColor={fogged(FACE_SHADES[kind][1], fog)} />
              </linearGradient>
            );
          }),
        )}
        {(["warn", "liq"] as const).map((tone) => (
          <radialGradient key={tone} id={`${id}-pool-${tone}`}>
            {/* (1 − r)², like the scene's pool falloff */}
            <stop offset="0" stopColor={hex[tone]} stopOpacity="1" />
            <stop offset="0.5" stopColor={hex[tone]} stopOpacity="0.25" />
            <stop offset="1" stopColor={hex[tone]} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>

      <rect width={frame.width} height={frame.height} fill={hex.void} />
      <rect width={frame.width} height={frame.height} fill={`url(#${id}-haze)`} />
      <rect width={frame.width} height={frame.height} fill={`url(#${id}-glow)`} />

      <g fill="none" stroke="#ffffff" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {frame.grid.map((line) => (
          <path key={line.opacity} d={line.d} strokeOpacity={line.opacity} vectorEffect="non-scaling-stroke" />
        ))}
      </g>

      <g>
        {frame.pools.map((pool, i) => (
          <ellipse key={i} cx={pool.cx} cy={pool.cy} rx={pool.rx} ry={pool.ry} fill={`url(#${id}-pool-${pool.tone})`} opacity={pool.opacity} />
        ))}
      </g>

      <g strokeLinejoin="round" strokeLinecap="round">
        {frame.dominoes.map((d) => (
          <g key={d.index} data-domino={d.index}>
            {d.faces.map((f, i) => (
              <path key={i} d={f.d} fill={face(f.kind, f.fog)} />
            ))}
            {d.glow && (
              <path d={d.glow.d} fill="none" stroke={d.glow.color} strokeOpacity={d.glow.opacity} strokeWidth="5" vectorEffect="non-scaling-stroke" />
            )}
            {d.edges.map((e) => (
              <path key={e.color} d={e.d} fill="none" stroke={e.color} strokeOpacity={e.opacity} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}
