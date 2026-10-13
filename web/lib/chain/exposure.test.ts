import { describe, expect, it } from "vitest";
import { getAddress, numberToHex } from "viem";
import borrowers from "@/app/api/labels/borrowers.json";
import { realToPacked, type RealPosition } from "@/lib/kaskad/calibrate";
import { packPosition } from "@/lib/kaskad/pack";
import { fixtureRun } from "./__fixtures__/load";
import { classifyPositions } from "./book";
import { displayLabel, exposure, type BorrowerLabels } from "./exposure";

const sali = fixtureRun("sali"); // syrupUSDC -3 %, real Monad book (57 positions)
const classification = classifyPositions(sali.book, sali.result, sali.scenario);
const slots = sali.book.positions.map((p) => p.raw);
const book9 = (borrowers as unknown as { books: Record<string, { positions: (RealPosition & { user: string })[] }> }).books["9"];

/** Labels for every borrower of the book: the largest one tagged as a fund, two as CeFi, the rest unlabelled. */
function labelsFor(): BorrowerLabels {
  const sorted = [...book9.positions].sort((a, b) => b.debtUsd - a.debtUsd);
  return {
    assetId: 9,
    chain: "monad",
    sourceBlock: 108_133_182,
    total: sorted.length,
    entries: sorted.map((p, i) => ({
      raw: numberToHex(packPosition(realToPacked(p))),
      address: getAddress(p.user),
      debtUsd: p.debtUsd,
      labels:
        i === 0
          ? [{ label: "Example Fund", category: "defi", kind: ["entity"] }, { label: "High Balance", category: "behavioral" }]
          : i < 3
            ? [{ label: `Exchange ${i}`, category: "cefi" }]
            : [],
    })),
  };
}

describe("exposure: cascade outcome × Nansen labels", () => {
  it("every slot of the real syrupUSDC book on chain has its borrower in borrowers.json", () => {
    const packed = new Set(book9.positions.map((p) => packPosition(realToPacked(p))));
    expect(slots.every((raw) => packed.has(raw))).toBe(true);
  });

  it("puts the borrower and its labels on the exact position the engine simulated", () => {
    const x = exposure(classification, slots, labelsFor())!;
    expect(x).not.toBeNull();
    // The largest position is the book's first slot (the loader sorts by debt) and carries the fund label.
    expect(x.largest!.position.name).toBe("Example Fund");
    expect(x.largest!.position.category).toBe("defi");
    expect(x.largest!.share).toBeGreaterThan(0.2);
    // -3 %: the cascade reaches positions (liquidated or stuck); hit debt adds up from them.
    expect(x.hit.length).toBeGreaterThan(0);
    expect(x.hitDebtUsd).toBeCloseTo(x.hit.reduce((s, p) => s + p.debtUsd, 0), 6);
    expect(x.hit.every((p, i, a) => i === 0 || a[i - 1].debtUsd >= p.debtUsd)).toBe(true);
    // Groups cover the whole book once.
    expect(x.groups.reduce((s, g) => s + g.positions, 0)).toBe(classification.consistent ? classification.positions.length : 0);
    expect(x.groups.map((g) => g.category)).toEqual(expect.arrayContaining(["defi", "cefi", "unlabelled"]));
  });

  it("keeps lookups that failed apart from borrowers without a label", () => {
    const l = labelsFor();
    l.entries[0] = { ...l.entries[0], labels: null };
    const x = exposure(classification, slots, l)!;
    expect(x.groups.find((g) => g.category === "not-looked-up")?.positions).toBe(1);
  });

  it("names an entity before a behavioural tag", () => {
    expect(displayLabel([{ label: "High Balance", category: "behavioral" }, { label: "Wintermute", category: "cefi", kind: ["entity"] }])).toEqual({ name: "Wintermute", category: "cefi" });
    expect(displayLabel([{ label: "Smart Trader", category: "smart_money" }])).toEqual({ name: "Smart Trader", category: "smart_money" });
    expect(displayLabel([])).toEqual({ name: null, category: null });
  });
});

  it("never assigns an address when packed slots are ambiguous", () => {
    const labels = labelsFor();
    labels.entries.push({ ...labels.entries[0], address: "0x0000000000000000000000000000000000000001" });
    expect(exposure(classification, slots, labels)!.largest!.position.address).toBeNull();
    const duplicateSlots = [...slots];
    duplicateSlots[1] = duplicateSlots[0];
    expect(exposure(classification, duplicateSlots, labelsFor())!.largest!.position.address).toBeNull();
  });
  it("refuses inconsistent classifications", () => {
    const bad = classifyPositions(sali.book, { ...sali.result, totalDebt: sali.result.totalDebt + 1n }, sali.scenario);
    expect(exposure(bad, slots, labelsFor())).toBeNull();
  });
