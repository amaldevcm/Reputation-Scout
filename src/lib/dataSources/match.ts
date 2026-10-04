import type { Confidence } from "../types.js";

const NOISE_WORDS = new Set([
  "inc", "incorporated", "llc", "ltd", "limited", "corp", "corporation", "co",
  "company", "plc", "lp", "llp", "the", "and", "de", "na",
]);

/** Lowercased, punctuation-free company name with legal suffixes removed. */
export function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE_WORDS.has(w))
    .join(" ");
}

export type NameMatch = "exact" | "partial" | "none";

/** Compares two company names: same after normalization, one inside the other, or unrelated. */
export function matchName(target: string, candidate: string): NameMatch {
  const a = normName(target);
  const b = normName(candidate);
  if (!a || !b) return "none";
  if (a === b) return "exact";
  if (` ${b} `.includes(` ${a} `) || ` ${a} `.includes(` ${b} `)) return "partial";
  return "none";
}

/** True when `target` appears as whole words anywhere in `text`. */
export function containsName(text: string, target: string): boolean {
  const t = normName(target);
  if (!t) return false;
  return ` ${normName(text)} `.includes(` ${t} `);
}

/**
 * Name-only matches can't tell two companies with the same name apart, so an
 * exact name is "medium" (the same convention disambiguate.ts uses) and a
 * partial one is "low". Callers upgrade to "high" with a domain match.
 */
export function confidenceFor(match: NameMatch): Confidence {
  return match === "exact" ? "medium" : "low";
}
