import { fetchJson } from "./http.js";
import { containsName } from "./match.js";
import { normalizeDomain } from "../domain.js";
import { num, clip } from "./format.js";
import type { MatchedPage } from "../types.js";
import type { DataSource } from "./types.js";

interface HnHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string;
}
interface HnResponse {
  nbHits: number;
  hits: HnHit[];
}

/**
 * Hacker News stories mentioning the company, via the free Algolia search API.
 * Skews heavily toward tech-industry opinion, so it's most useful for
 * software and startup companies and mostly empty for everyone else.
 */
export const hackerNewsSource: DataSource = async (companyName, hints) => {
  const url =
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(`"${companyName}"`)}` +
    `&tags=story&hitsPerPage=30`;
  const data = await fetchJson<HnResponse>(url);

  // Algolia matches words anywhere in the story; keep ones that name the company in the title or link.
  const relevant = data.hits.filter((h) => containsName(`${h.title ?? ""} ${h.url ?? ""}`, companyName));
  if (relevant.length === 0) return { kind: "no_results" };

  const byPoints = [...relevant].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)).slice(0, 5);
  const byDate = [...relevant].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);

  const line = (h: HnHit) =>
    `- "${clip(h.title ?? "(untitled)", 120)}" (${num(h.points ?? 0)} points, ${num(h.num_comments ?? 0)} comments, ${h.created_at.slice(0, 10)}) https://news.ycombinator.com/item?id=${h.objectID}`;

  const lines = [
    `Hacker News stories naming "${companyName}": ${num(data.nbHits)} loose matches, ${relevant.length} of the top 30 name it in the title or link.`,
    "Highest-scoring:",
    ...byPoints.map(line),
    "Most recent:",
    ...byDate.map(line),
    "Note: Hacker News reflects the views of a tech-industry audience and discussion threads are not reviews. Open the threads for the actual sentiment.",
  ];

  const matchedOn = ["exact-name-match"];
  let confidence: MatchedPage["confidence"] = "medium";
  if (hints.domain) {
    const domain = normalizeDomain(hints.domain);
    if (relevant.some((h) => (h.url ?? "").toLowerCase().includes(domain))) {
      matchedOn.push(`domain:${hints.domain}`);
      confidence = "high";
    }
  }

  const pageUrl = `https://hn.algolia.com/?q=${encodeURIComponent(companyName)}&type=story`;
  return {
    kind: "ok",
    detail: `${relevant.length} relevant stories`,
    pages: [{ url: pageUrl, title: `Hacker News: ${companyName}`, confidence, matchedOn }],
    findings: [{ url: pageUrl, text: lines.join("\n"), redacted: true }],
  };
};
