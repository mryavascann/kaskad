import { describe, expect, it } from "vitest";
import { isDemoMode } from "./demo";

describe("isDemoMode", () => {
  it("turns on for ?demo=1 and its spellings", () => {
    for (const search of ["?demo=1", "demo=1", "?demo", "?demo=true", "?demo=TRUE", "?x=2&demo=1", "?demo=on"]) {
      expect(isDemoMode(search), search).toBe(true);
    }
  });

  it("stays off without the flag or with an explicit off value", () => {
    for (const search of ["", "?", "?demo=0", "?demo=false", "?demo=no", "?demos=1", "?x=demo"]) {
      expect(isDemoMode(search), search).toBe(false);
    }
  });

  it("returns false on the server when no query string is given", () => {
    expect(typeof window).toBe("undefined");
    expect(isDemoMode()).toBe(false);
  });
});
