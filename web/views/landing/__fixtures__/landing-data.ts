// Landing props built from recorded on-chain previews (lib/chain and viz fixtures), replayed offline.
// Nothing is typed in by hand: the numbers are whatever the recorded runs say.
import { FIXTURE_BLOCKS, fixtureRun } from "@/lib/chain/__fixtures__/load";
import { classifyPositions } from "@/lib/chain/book";
import { findingFacts } from "@/lib/chain/finding";
import { PROOF_TXS } from "@/lib/chain/proofs";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { VIZ_BLOCK, VIZ_CALIBRATED } from "@/viz/__fixtures__/load";
import { landingFinding, landingPositions, landingScale, type LandingData } from "../data";

export function recordedLanding(): LandingData {
  const run = fixtureRun("sali");
  const finding = findingFacts(run.result, run.scenario, {
    engine: DEPLOYMENT.contracts.kaskadMC ?? DEPLOYMENT.contracts.kaskad,
    blockNumber: BigInt(FIXTURE_BLOCKS.book9),
    fetchedAt: 0,
  });
  const c = classifyPositions(run.book, run.result, run.scenario);
  if (!c.consistent) throw new Error("fixture sali did not classify");
  const scaleHash = PROOF_TXS.find((p) => p.id === "scale")?.hash ?? "0x";
  return {
    finding: landingFinding(finding),
    positions: landingPositions(finding, c),
    scale: landingScale({
      hash: scaleHash,
      blockNumber: VIZ_BLOCK,
      positionsUsed: VIZ_CALIBRATED.result.positionsUsed,
      memoryBytes: VIZ_CALIBRATED.result.memoryBytes,
      gasUsed: VIZ_CALIBRATED.result.gasUsed,
    }),
    // No recorded market reads: tests that need them pass their own.
    markets: null,
    readAt: 0,
  };
}

export const EMPTY_LANDING: LandingData = { finding: null, positions: null, scale: null, markets: null, readAt: 0 };
