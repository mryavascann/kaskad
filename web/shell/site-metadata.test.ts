import { describe, expect, it } from "vitest";
import { findingScenario } from "@/lib/chain/finding";
import { siteDescription } from "./site-metadata";

describe("siteDescription", () => {
  it("takes the shock from the finding's scenario, formatted per locale", () => {
    const pct = findingScenario().shockBps / 100;
    expect(siteDescription("en")).toContain(`drops ${pct}%?`);
    expect(siteDescription("tr")).toContain(`Bir varlık %${pct} düşerse`);
  });
});

describe("commonMessages", () => {
  it("holds only plain data, since SiteShell passes it to Client Components", async () => {
    const { commonMessages } = await import("@/i18n/messages/common");
    const hasFunction = (v: unknown): boolean =>
      typeof v === "function" || (typeof v === "object" && v !== null && Object.values(v).some(hasFunction));
    expect(hasFunction(commonMessages)).toBe(false);
  });
});
