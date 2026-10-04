import { fetchJson } from "./http.js";
import { containsName, confidenceFor, normName } from "./match.js";
import { num } from "./format.js";
import type { DataSource } from "./types.js";

interface DocketResult {
  caseName: string;
  court: string;
  dateFiled: string;
  docket_absolute_url: string;
}
interface SearchResponse {
  count: number;
  results: DocketResult[];
}

const PAGE_SIZE = 20;

function side(caseName: string, company: string): "defendant" | "plaintiff" | "other" {
  const parts = caseName.split(/\s+v\.?\s+/i);
  if (parts.length < 2) return "other";
  const left = parts[0];
  const right = parts.slice(1).join(" v. ");
  if (containsName(right, company)) return "defendant";
  if (containsName(left, company)) return "plaintiff";
  return "other";
}

/**
 * CourtListener (Free Law Project): federal dockets from PACER/RECAP whose
 * case name contains the company. Matching is by name only, so it can't tell
 * two same-named companies apart, and a docket shows that a case exists, not
 * its outcome or who was at fault.
 */
export const courtListenerSource: DataSource = async (companyName) => {
  if (!normName(companyName)) return { kind: "no_results" };

  const url =
    `https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(`caseName:"${companyName}"`)}` +
    `&type=r&order_by=${encodeURIComponent("dateFiled desc")}&page_size=${PAGE_SIZE}`;
  const data = await fetchJson<SearchResponse>(url);

  // The search is fuzzy; keep only dockets that really name the company.
  const matched = data.results.filter((r) => containsName(r.caseName, companyName));
  if (matched.length === 0) return { kind: "no_results" };

  const counts = { defendant: 0, plaintiff: 0, other: 0 };
  for (const r of matched) counts[side(r.caseName, companyName)]++;

  const lines = [
    `Federal court dockets (CourtListener/RECAP) with "${companyName}" in the case name: about ${num(data.count)} in the index; the ${matched.length} most recent matching dockets were reviewed.`,
    `In those, the company is named as a defendant in ${counts.defendant}, as a plaintiff in ${counts.plaintiff}, and in another role in ${counts.other}.`,
    "Most recent:",
    ...matched.slice(0, 5).map(
      (r) =>
        `- ${r.caseName} (${r.court}, filed ${r.dateFiled}) https://www.courtlistener.com${r.docket_absolute_url}`
    ),
    "Note: a docket shows that a case exists, not its outcome or who was at fault. Matched on case name only, so check these are the intended company.",
  ];

  const pageUrl = `https://www.courtlistener.com/?q=${encodeURIComponent(`caseName:"${companyName}"`)}&type=r`;
  return {
    kind: "ok",
    detail: `${num(data.count)} docket(s) in index, ${matched.length} reviewed`,
    pages: [
      {
        url: pageUrl,
        title: `CourtListener dockets: ${companyName}`,
        confidence: confidenceFor("exact"),
        matchedOn: ["court-case-name-match"],
      },
    ],
    findings: [{ url: pageUrl, text: lines.join("\n"), redacted: true }],
  };
};
