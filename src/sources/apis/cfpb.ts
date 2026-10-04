import { fetchJson } from "./http.js";
import { matchName, confidenceFor } from "./match.js";
import { num, pct, topList, isoDaysAgo } from "./format.js";
import type { DataSource } from "./types.js";

const BASE = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/";

interface Bucket {
  key: string;
  doc_count: number;
}
interface CfpbResponse {
  hits: { total: { value: number } };
  aggregations?: Record<string, Record<string, { buckets: Bucket[] }>>;
}

function buckets(res: CfpbResponse, key: string): Bucket[] {
  return res.aggregations?.[key]?.[key]?.buckets ?? [];
}

function query(params: Record<string, string>): string {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * CFPB Consumer Complaint Database: complaints about financial products and
 * services (banks, lenders, card issuers, credit bureaus, debt collectors,
 * money transfer). Companies outside that scope simply have no entries.
 */
export const cfpbSource: DataSource = async (companyName) => {
  // Step 1: which complaint-database company names contain this name?
  const candidates = await fetchJson<CfpbResponse>(
    query({ search_term: companyName, field: "company", size: "0" })
  );
  const companyBuckets = buckets(candidates, "company");

  const scored = companyBuckets
    .map((b) => ({ ...b, match: matchName(companyName, b.key) }))
    .filter((b) => b.match !== "none");
  if (scored.length === 0) return { kind: "no_results" };

  // Prefer an exact name; otherwise the partial match with the most complaints.
  const chosen = scored.find((b) => b.match === "exact") ?? scored[0];

  // Step 2: aggregates for just that company, plus its last-12-months volume.
  const [detail, recent] = await Promise.all([
    fetchJson<CfpbResponse>(query({ company: chosen.key, size: "0" })),
    fetchJson<CfpbResponse>(
      query({ company: chosen.key, size: "0", no_aggs: "true", date_received_min: isoDaysAgo(365) })
    ),
  ]);

  const total = detail.hits.total.value;
  const recentTotal = recent.hits.total.value;
  const responses = buckets(detail, "company_response");
  const timely = buckets(detail, "timely");
  const untimely = timely.find((b) => b.key === "No")?.doc_count ?? 0;

  const lines = [
    `CFPB consumer complaints filed against "${chosen.key}": ${num(total)} total, ${num(recentTotal)} in the last 12 months.`,
    `Top products: ${topList(buckets(detail, "product"))}.`,
    `Top issues: ${topList(buckets(detail, "issue"))}.`,
    `Company responses: ${responses
      .slice(0, 4)
      .map((b) => `${b.key} ${pct(b.doc_count, total)}`)
      .join(", ")}.`,
    `Responses not sent on time: ${num(untimely)} (${pct(untimely, total)}).`,
  ];
  if (scored.length > 1) {
    lines.push(
      `Other complaint-database names also matched: ${scored
        .filter((b) => b.key !== chosen.key)
        .slice(0, 3)
        .map((b) => b.key)
        .join("; ")}.`
    );
  }
  lines.push(
    "Note: these are consumer allegations submitted to the CFPB, not findings of wrongdoing. The database covers financial products and services only."
  );

  const url = `https://www.consumerfinance.gov/data-research/consumer-complaints/search/?searchField=company&searchText=${encodeURIComponent(chosen.key)}`;
  return {
    kind: "ok",
    detail: `${num(total)} complaints against "${chosen.key}"`,
    pages: [
      {
        url,
        title: `CFPB complaints: ${chosen.key}`,
        confidence: confidenceFor(chosen.match),
        matchedOn: [`cfpb-company:${chosen.key}`, chosen.match === "exact" ? "exact-name-match" : "partial-name-match"],
      },
    ],
    findings: [{ url, text: lines.join("\n"), redacted: true }],
  };
};
