import { describe, expect, it } from "vitest";
import { findingScenario } from "@/lib/chain/finding";
import { FALLBACK_SITE_URL, rootMetadata, siteDescription, siteUrl } from "./site-metadata";

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

describe("siteUrl", () => {
  it("uses Vercel's production host when it is set", () => {
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "kaskad.example.app" }).href).toBe("https://kaskad.example.app/");
  });

  it("falls back to the live site without it (or when it is blank)", () => {
    expect(siteUrl({}).href).toBe(`${FALLBACK_SITE_URL}/`);
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: " " }).href).toBe(`${FALLBACK_SITE_URL}/`);
  });
});

describe("rootMetadata", () => {
  it("sets the base URL, the large Twitter card and the OG site name and locale per locale", () => {
    const en = rootMetadata("en");
    const tr = rootMetadata("tr");
    expect(en.metadataBase).toBeInstanceOf(URL);
    expect(en.twitter).toMatchObject({ card: "summary_large_image" });
    expect(en.openGraph).toMatchObject({ siteName: "Kaskad", locale: "en_US" });
    expect(tr.openGraph).toMatchObject({ siteName: "Kaskad", locale: "tr_TR" });
    expect(tr.description).toBe(siteDescription("tr"));
  });
});
