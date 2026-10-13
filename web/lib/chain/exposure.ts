// "Who is exposed?": the cascade's per-position outcome (book.ts classifyPositions) joined with Nansen
// labels of the borrowers behind each slot (GET /api/labels). A position is matched to its address by
// the slot's packed value, exactly as the loader wrote it. Read only.

import type { Address, Hex } from "viem";
import type { Classification, PositionOutcome } from "./book";

/** One Nansen label (non-premium profiler labels). `category`: smart_money, behavioral, defi, social, cefi, nft, others. */
export type NansenLabel = { label: string; category: string; kind?: string[] };

/** GET /api/labels?asset= */
export type BorrowerLabels = {
  assetId: number;
  chain: "monad" | "ethereum";
  /** Monad mainnet block of the borrower snapshot (null for the Ethereum comparison books). */
  sourceBlock: number | null;
  /** Borrowers in the book; only the largest ones are looked up. */
  total: number;
  /** labels: null = Nansen could not be read for this address (yet); [] = no public label. */
  entries: { raw: Hex; address: Address; debtUsd: number; labels: NansenLabel[] | null }[];
};

/** Outcomes that mean the cascade reached the position. */
const HIT: readonly PositionOutcome[] = ["liquidated", "stuck", "bad-debt"];

export type ExposedPosition = {
  index: number;
  address: Address | null;
  /** Entity or name label when Nansen has one, else the first label, else null. */
  name: string | null;
  category: string | null;
  labels: NansenLabel[];
  /** Looked up at Nansen (top borrowers by debt), whether or not it has a label. */
  lookedUp: boolean;
  outcome: PositionOutcome;
  debtUsd: number;
  shortfallUsd: number;
};

export type ExposureGroup = { category: string; positions: number; debtUsd: number; hitDebtUsd: number; shortfallUsd: number };

export type Exposure = {
  /** Positions the cascade reached (liquidated, stuck or bad debt), largest debt first. */
  hit: ExposedPosition[];
  /** By Nansen category ("unlabelled", "not-looked-up" included), largest hit debt first. */
  groups: ExposureGroup[];
  bookDebtUsd: number;
  hitDebtUsd: number;
  /** Share of the hit debt whose borrower carries at least one Nansen label. */
  labelledHitShare: number;
  /** The largest borrower and its share of the book's debt. */
  largest: { position: ExposedPosition; share: number } | null;
};

const ENTITY_KINDS = ["entity", "name"];

export function displayLabel(labels: NansenLabel[]): { name: string | null; category: string | null } {
  if (labels.length === 0) return { name: null, category: null };
  const entity = labels.find((l) => l.kind?.some((k) => ENTITY_KINDS.includes(k))) ?? labels.find((l) => l.category === "cefi" || l.category === "defi");
  const pick = entity ?? labels[0];
  return { name: pick.label, category: pick.category };
}

/**
 * Joins a consistent classification with the book's packed slots (by index) and the labels (by slot).
 * Null when the classification is not consistent (the per-position view is not trusted then).
 */
export function exposure(classification: Classification, slots: readonly bigint[], labels: BorrowerLabels): Exposure | null {
  if (!classification.consistent) return null;
  const byRaw = new Map<bigint, BorrowerLabels["entries"][number]>();
  const ambiguous = new Set<bigint>();
  for (const e of labels.entries) {
    const raw = BigInt(e.raw);
    if (byRaw.has(raw)) ambiguous.add(raw);
    byRaw.set(raw, e);
  }
  const seen = new Set<bigint>();
  for (const raw of slots) {
    if (seen.has(raw)) ambiguous.add(raw);
    seen.add(raw);
  }
  for (const raw of ambiguous) byRaw.delete(raw);
  const all: ExposedPosition[] = classification.positions.map((p) => {
    const raw = slots[p.index];
    const e = raw === undefined ? undefined : byRaw.get(raw);
    const ls = e?.labels ?? [];
    const { name, category } = displayLabel(ls);
    return {
      index: p.index,
      address: e?.address ?? null,
      name,
      category,
      labels: ls,
      lookedUp: Boolean(e && e.labels !== null),
      outcome: p.outcome,
      debtUsd: p.debtUsd,
      shortfallUsd: p.shortfallUsd,
    };
  });
  const groupOf = (p: ExposedPosition) => (!p.lookedUp ? "not-looked-up" : (p.category ?? "unlabelled"));
  const groups = new Map<string, ExposureGroup>();
  for (const p of all) {
    const key = groupOf(p);
    const g = groups.get(key) ?? { category: key, positions: 0, debtUsd: 0, hitDebtUsd: 0, shortfallUsd: 0 };
    g.positions += 1;
    g.debtUsd += p.debtUsd;
    if (HIT.includes(p.outcome)) g.hitDebtUsd += p.debtUsd;
    g.shortfallUsd += p.shortfallUsd;
    groups.set(key, g);
  }
  const hit = all.filter((p) => HIT.includes(p.outcome)).sort((a, b) => b.debtUsd - a.debtUsd);
  const bookDebtUsd = all.reduce((s, p) => s + p.debtUsd, 0);
  const hitDebtUsd = hit.reduce((s, p) => s + p.debtUsd, 0);
  const labelledHit = hit.filter((p) => p.labels.length > 0).reduce((s, p) => s + p.debtUsd, 0);
  const top = [...all].sort((a, b) => b.debtUsd - a.debtUsd)[0];
  return {
    hit,
    groups: [...groups.values()].sort((a, b) => b.hitDebtUsd - a.hitDebtUsd || b.debtUsd - a.debtUsd),
    bookDebtUsd,
    hitDebtUsd,
    labelledHitShare: hitDebtUsd > 0 ? labelledHit / hitDebtUsd : 0,
    largest: top && bookDebtUsd > 0 ? { position: top, share: top.debtUsd / bookDebtUsd } : null,
  };
}
