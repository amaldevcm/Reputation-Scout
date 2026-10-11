import { describe, expect, it } from "vitest";
import { hasAnyHints, scoreMatch } from "../../src/pipeline/disambiguate.js";

describe("scoreMatch", () => {
  it("is high when the domain matches the URL", () => {
    const r = scoreMatch("Acme", { domain: "https://www.Acme.com/" }, { url: "https://acme.com/reviews" });
    expect(r.confidence).toBe("high");
    expect(r.matchedOn).toContain("domain:https://www.Acme.com/");
  });

  it("is high when the location matches", () => {
    const r = scoreMatch("Acme", { location: "Austin" }, { url: "https://x.com", title: "Acme Austin TX" });
    expect(r.confidence).toBe("high");
  });

  it("is medium on an exact name with no conflicting signal", () => {
    const r = scoreMatch("Acme", {}, { url: "https://x.com", title: "Acme Reviews" });
    expect(r).toEqual({ confidence: "medium", matchedOn: ["exact-name-match"] });
  });

  it("drops to low when the location hint is missing from the page", () => {
    const r = scoreMatch("Acme", { location: "Austin" }, { url: "https://x.com", title: "Acme Reviews" });
    expect(r.confidence).toBe("low");
  });

  it("is low with a partial-name marker when nothing matched", () => {
    expect(scoreMatch("Acme", {}, { url: "https://x.com", title: "Other" })).toEqual({
      confidence: "low",
      matchedOn: ["partial-name-match"],
    });
  });
});

describe("hasAnyHints", () => {
  it("detects any hint", () => {
    expect(hasAnyHints({})).toBe(false);
    expect(hasAnyHints({ industry_hint: "fintech" })).toBe(true);
  });
});
