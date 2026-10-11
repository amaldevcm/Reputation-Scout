import { describe, expect, it } from "vitest";
import { confidenceFor, containsName, matchName, normName } from "../../src/sources/apis/match.js";

describe("normName", () => {
  it("strips legal suffixes and punctuation", () => {
    expect(normName("The Acme Corp., Inc.")).toBe("acme");
    expect(normName("Ben & Jerry's")).toBe("ben jerry s");
  });
});

describe("matchName", () => {
  it.each([
    ["Acme Inc", "ACME, LLC", "exact"],
    ["Acme", "Acme Widgets", "partial"],
    ["Acme Widgets", "Acme", "partial"],
    ["Acme", "Acmeco", "none"],
    ["Inc", "LLC", "none"],
  ])("%s vs %s -> %s", (a, b, expected) => {
    expect(matchName(a, b)).toBe(expected);
  });
});

describe("containsName", () => {
  it("matches whole words only", () => {
    expect(containsName("Why I left Acme Corp last year", "Acme")).toBe(true);
    expect(containsName("Acmeco raises funding", "Acme")).toBe(false);
  });
});

describe("confidenceFor", () => {
  it("never gives high from a name alone", () => {
    expect(confidenceFor("exact")).toBe("medium");
    expect(confidenceFor("partial")).toBe("low");
  });
});
