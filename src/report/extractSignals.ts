/**
 * Best-effort, regex-based extraction of a review count and a numeric
 * rating from a source's extracted page text. This is heuristic — review
 * sites format this differently and inconsistently — so callers should
 * treat a null result as "not detected", not "zero" or "unavailable",
 * and the report says so explicitly rather than showing a blank or a
 * misleading dash-as-zero.
 */

export function extractReviewCount(text: string): number | null {
  const match = text.match(/(\d[\d,]*)\+?\s*reviews?\b/i);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function extractRating(text: string): string | null {
  const outOfFive = text.match(/(\d(?:\.\d)?)\s*(?:\/|out of)\s*5\b/i);
  if (outOfFive) return `${outOfFive[1]}/5`;

  const trustScore = text.match(/trustscore[^0-9]{0,10}(\d(?:\.\d)?)/i);
  if (trustScore) return `TrustScore ${trustScore[1]}`;

  const stars = text.match(/(\d(?:\.\d)?)\s*star/i);
  if (stars) return `${stars[1]} stars`;

  return null;
}
