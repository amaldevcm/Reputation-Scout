import { fetchJson } from "./http.js";
import { matchName, confidenceFor, normName } from "./match.js";
import { num, isoDaysAgo } from "./format.js";
import type { DataSource } from "./types.js";

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

interface FtsHit {
  _source: { form?: string; root_forms?: string[]; file_date: string };
}
interface FtsResponse {
  hits: { total: { value: number }; hits: FtsHit[] };
}

// Terms that show up in filings when a company discloses litigation, a
// regulatory order, or an accounting problem. Deliberately narrower than a
// bare "investigation", which appears in nearly every large company's boilerplate.
const RISK_QUERY =
  '"class action" OR "consent order" OR subpoena OR "material weakness" OR restatement OR "Wells notice"';
const FILING_FORMS = "10-K,10-Q,8-K";
const WINDOW_DAYS = 730;

let tickersPromise: Promise<TickerEntry[]> | null = null;

function loadTickers(): Promise<TickerEntry[]> {
  if (!tickersPromise) {
    tickersPromise = fetchJson<Record<string, TickerEntry>>("https://www.sec.gov/files/company_tickers.json")
      .then((data) => Object.values(data))
      .catch((err) => {
        tickersPromise = null; // allow a retry on the next run
        throw err;
      });
  }
  return tickersPromise;
}

/**
 * SEC EDGAR: for companies with a public listing, counts recent 10-K/10-Q/8-K
 * filings that mention litigation, regulatory-order or accounting-problem
 * terms. A term hit means the words appear in a filing (often as generic
 * risk-factor language), not that an incident occurred.
 */
export const edgarSource: DataSource = async (companyName) => {
  const tickers = await loadTickers();

  // EDGAR registrant names carry a state-of-incorporation tail ("WELLS FARGO & COMPANY/MN").
  const registrantName = (title: string) => title.replace(/\/[A-Za-z]{2,3}\b.*$/, "").trim();

  const candidates = tickers
    .map((t) => ({ t, match: matchName(companyName, registrantName(t.title)) }))
    .filter((c) => c.match !== "none");
  // Partial matches are only trusted when the listed name starts with ours
  // ("Apple" -> "Apple Inc."), not when ours is buried inside a longer name.
  const target = normName(companyName);
  const chosen =
    candidates.find((c) => c.match === "exact") ??
    candidates.find((c) => normName(registrantName(c.t.title)).startsWith(`${target} `));
  if (!chosen) {
    return { kind: "not_applicable", reason: "no SEC-listed company with this name (private companies don't file)" };
  }

  const { t, match } = chosen;
  const start = isoDaysAgo(WINDOW_DAYS);
  const end = new Date().toISOString().slice(0, 10);
  const ftsUrl =
    `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(RISK_QUERY)}` +
    `&ciks=${String(t.cik_str).padStart(10, "0")}&forms=${FILING_FORMS}&dateRange=custom&startdt=${start}&enddt=${end}`;
  const fts = await fetchJson<FtsResponse>(ftsUrl);

  const total = fts.hits.total.value;
  const byForm = new Map<string, number>();
  for (const h of fts.hits.hits) {
    const form = h._source.root_forms?.[0] ?? h._source.form ?? "other";
    byForm.set(form, (byForm.get(form) ?? 0) + 1);
  }
  const recentDates = fts.hits.hits.map((h) => h._source.file_date).sort().reverse();

  const lines = [
    `SEC-listed company: ${t.title} (ticker ${t.ticker}).`,
    total === 0
      ? `No 10-K, 10-Q or 8-K filings in the last two years matched the litigation/regulatory-order/accounting-problem terms.`
      : `${num(total)} filing document(s) in the last two years mention litigation, regulatory-order or accounting-problem terms (${[...byForm]
          .map(([form, n]) => `${form}: ${n}`)
          .join(", ")}); most recent filed ${recentDates[0]}.`,
    "Note: a term hit means the words appear in a filing, often as generic risk-factor language. It does not mean an incident occurred. Read the filings before drawing conclusions.",
  ];

  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${t.cik_str}&type=10-K&dateb=&owner=include&count=40`;
  return {
    kind: "ok",
    detail: `${t.title} (${t.ticker}): ${num(total)} filing hit(s)`,
    pages: [
      {
        url,
        title: `SEC filings: ${t.title}`,
        confidence: confidenceFor(match),
        matchedOn: [`sec-listing:${t.ticker}`, match === "exact" ? "exact-name-match" : "partial-name-match"],
      },
    ],
    findings: [{ url, text: lines.join("\n"), redacted: true }],
  };
};
