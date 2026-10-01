/**
 * Pure helpers of the console view: chain facts → formatted strings for the copy. No React, no
 * network, server-safe (the page computes preset facts on the server with a fixed `now`).
 */
import type { Formatters } from "@/i18n/format";
import type { NarrativeText, PresetText } from "@/i18n/messages/console";
import type { NarrativeFacts } from "@/lib/chain/narrative";
import { CALIBRATED } from "@/lib/kaskad/config";
import { presetFacts, visiblePresets, type PresetFacts, type PresetId } from "@/lib/chain/scenario";
import type { Scenario, Settings } from "@/lib/chain/types";

/** A preset as the client receives it: settings plus the facts its copy is built from. */
export type ConsolePreset = { id: PresetId; settings: Settings; facts: PresetFacts };

/** Visible presets with their facts at `now` (days to maturity). Plain data: crosses the server boundary. */
export function consolePresets(now: Date): ConsolePreset[] {
  return visiblePresets().map((p) => ({ id: p.id, settings: { ...p.settings }, facts: presetFacts(p.id, now) }));
}

/** Decimals a shock needs: the slider moves in 0.1 % steps. */
export const shockDigits = (pct: number): number => (Number.isInteger(Math.round(pct * 10) / 10) ? 0 : 1);

/** −3% / −%3, −0.3% / −%0,3. */
export const shockLabel = (pct: number, fmt: Formatters): string => fmt.drop(pct / 100, shockDigits(pct));

export function presetText(f: PresetFacts, fmt: Formatters): PresetText {
  return {
    symbol: f.symbol,
    shock: shockLabel(f.shockPct, fmt).replace(/^[−-]/, ""),
    debt: fmt.usd(f.debtUsd),
    depth: fmt.usd(f.depthUsd),
    depthToDebt: fmt.ratio(f.depthToDebt),
    positions: fmt.int(f.positions),
    days: f.maturity && f.maturity.daysLeft >= 0 ? fmt.int(f.maturity.daysLeft) : null,
    chain: f.chain,
  };
}

/**
 * The settings a scenario came from, enough for resultFacts / narrativeFacts / calibratedScale
 * (asset, calibrated flag, shock, path, oracle). Lets the stage describe the result it shows even
 * while the inputs have already moved on.
 */
export function settingsForScenario(s: Scenario): Settings {
  const calibrated = s.assetId >= CALIBRATED;
  return {
    assetId: calibrated ? s.assetId - CALIBRATED : s.assetId,
    shockPct: s.shockBps / 100,
    steps: s.steps,
    rounds: s.maxRoundsPerStep,
    feedback: s.oracleFeedbackBps,
    calibrated,
    resolution: s.maxPositions,
  };
}

/** Price with 4 significant decimals: $1.1848 / $1,1848. */
export const priceLabel = (usd: number, fmt: Formatters): string => `$${fmt.num(usd, 4)}`;

export function narrativeText(n: NarrativeFacts, fmt: Formatters): NarrativeText {
  const shock = shockLabel(n.shockPct, fmt).replace(/^[−-]/, "");
  if (n.kind === "no-liquidations") return { kind: "no-liquidations", symbol: n.symbol, steps: fmt.int(n.steps), shock };
  return {
    kind: "cascade",
    symbol: n.symbol,
    steps: fmt.int(n.steps),
    shock,
    liquidations: fmt.int(n.liquidations),
    depth: fmt.usd(n.depthUsd),
    oracle:
      n.oracle.kind === "spiral"
        ? {
            kind: "spiral",
            start: `$${fmt.num(n.oracle.startPrice, 3)}`,
            end: `$${fmt.num(n.oracle.finalPrice, 3)}`,
            drop: fmt.drop(n.oracle.drop, 0),
          }
        : { kind: "external", arbitrage: n.oracle.arbitrage, recovery: fmt.pct(n.oracle.recoveryBps / 10_000, 0) },
    bad: n.outcome.badDebtUsd > 0 ? fmt.usd(n.outcome.badDebtUsd) : null,
    total: fmt.usd(n.outcome.totalDebtUsd),
    stuck: n.stuck ? fmt.usd(n.stuck.stuckDebtUsd) : null,
  };
}

/**
 * Whether moving the replay playhead from `from` to `to` passes a block with liquidations: the
 * blocks after `from` up to `to` going forward, `to` up to the one before `from` going back.
 */
export function crossesLiquidation(points: readonly { liquidations: number }[], from: number, to: number): boolean {
  if (from === to) return false;
  const [lo, hi] = to > from ? [from + 1, to] : [to, from - 1];
  for (let i = Math.max(0, lo); i <= Math.min(points.length - 1, hi); i++) if (points[i].liquidations > 0) return true;
  return false;
}
