import { describe, expect, it } from "vitest";
import { redactStructuralPII } from "../../src/report/redact.js";
import { extractRating, extractReviewCount } from "../../src/report/extractSignals.js";
import { buildQuery } from "../../src/pipeline/searchQuery.js";
import { normalizeDomain } from "../../src/util/domain.js";
import { slugify } from "../../src/util/slug.js";
import { clipText, httpError } from "../../src/providers/util.js";

describe("redactStructuralPII", () => {
  it("removes emails, phones and LinkedIn profiles", () => {
    const out = redactStructuralPII(
      "Mail jane.doe@acme.com or call (512) 555-1234, see https://www.linkedin.com/in/jane-doe"
    );
    expect(out).toBe("Mail [redacted-email] or call [redacted-phone], see [redacted-profile]");
  });

  it("keeps company LinkedIn pages", () => {
    const text = "https://www.linkedin.com/company/acme";
    expect(redactStructuralPII(text)).toBe(text);
  });
});

describe("extractSignals", () => {
  it("reads review counts", () => {
    expect(extractReviewCount("Based on 1,234 reviews")).toBe(1234);
    expect(extractReviewCount("no data")).toBeNull();
  });

  it("reads ratings in the formats sites use", () => {
    expect(extractRating("Rated 4.2 out of 5")).toBe("4.2/5");
    expect(extractRating("TrustScore 3.8")).toBe("TrustScore 3.8");
    expect(extractRating("4 stars overall")).toBe("4 stars");
    expect(extractRating("nothing")).toBeNull();
  });
});

describe("buildQuery", () => {
  it("adds the site hint and hints", () => {
    expect(buildQuery("Acme", "glassdoor", { domain: "acme.com", location: "Austin" })).toBe(
      "Acme reviews site:glassdoor.com acme.com Austin"
    );
    expect(buildQuery("Acme", "unknown_source", {})).toBe("Acme reviews");
  });
});

describe("small utils", () => {
  it("normalizeDomain", () => {
    expect(normalizeDomain(" https://www.Example.com/about?x=1 ")).toBe("example.com");
  });

  it("slugify", () => {
    expect(slugify("  Ben & Jerry's, Inc. ")).toBe("ben-jerry-s-inc");
  });

  it("clipText collapses whitespace and clips", () => {
    expect(clipText("a   b\n c")).toBe("a b c");
    expect(clipText("abcdef", 3)).toBe("abc…");
  });

  it("httpError maps 402 to rate_limited and 403 to bot_blocked", () => {
    expect(httpError("x", 402)).toMatchObject({ kind: "error", reason: "rate_limited" });
    expect(httpError("x", 403)).toMatchObject({ kind: "error", reason: "bot_blocked" });
  });
});
