import { normalizeDomain } from "../util/domain.js";
import type { Confidence, DisambiguationHints } from "../types.js";

export interface ScoredMatch {
  confidence: Confidence;
  matchedOn: string[];
}

/**
 * Confidence scoring per matched page: high (domain or exact location
 * matched), medium (exact name match, no disambiguating signal either way),
 * low (loose/partial name match, or a mismatched location/industry signal).
 */
export function scoreMatch(
  companyName: string,
  hints: DisambiguationHints,
  page: { title?: string; url: string; snippet?: string }
): ScoredMatch {
  const matchedOn: string[] = [];
  const haystack = `${page.title ?? ""} ${page.snippet ?? ""}`.toLowerCase();
  const nameLower = companyName.toLowerCase();

  const nameExact = haystack.includes(nameLower);
  let domainMatched = false;
  let locationMatched = false;
  let mismatchSignal = false;

  if (hints.domain) {
    domainMatched = page.url.toLowerCase().includes(normalizeDomain(hints.domain));
    if (domainMatched) matchedOn.push(`domain:${hints.domain}`);
  }

  if (hints.location) {
    const locLower = hints.location.toLowerCase();
    locationMatched = haystack.includes(locLower);
    if (locationMatched) matchedOn.push(`location:${hints.location}`);
    else if (hints.location) mismatchSignal = true;
  }

  if (hints.industry_hint) {
    const industryLower = hints.industry_hint.toLowerCase();
    if (haystack.includes(industryLower)) {
      matchedOn.push(`industry:${hints.industry_hint}`);
    }
  }

  if (nameExact) matchedOn.push("exact-name-match");

  let confidence: Confidence;
  if (domainMatched || (hints.location && locationMatched)) {
    confidence = "high";
  } else if (nameExact && !mismatchSignal) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  if (matchedOn.length === 0) matchedOn.push("partial-name-match");

  return { confidence, matchedOn };
}

export function hasAnyHints(hints: DisambiguationHints): boolean {
  return Boolean(hints.domain || hints.location || hints.industry_hint);
}
