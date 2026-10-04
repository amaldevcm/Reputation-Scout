import { fetchJson } from "./http.js";
import { containsName } from "./match.js";
import { clip } from "./format.js";
import type { DataSource } from "./types.js";

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
}
interface ArtListResponse {
  articles?: GdeltArticle[];
}
interface ToneResponse {
  timeline?: { data: { date: string; value: number }[] }[];
}

// GDELT asks for at most one request every 5 seconds and answers 429 otherwise.
const GDELT_OPTS = { minGapMs: 5_500, retryOn429Ms: 7_000 };
const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** GDELT seendate looks like 20261002T103000Z. */
function gdeltDate(s: string): string {
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * Recent news coverage from GDELT's free DOC 2.0 API: a sample of headlines
 * and the average tone of English-language coverage over the last three
 * months. Tone is an automated score of the article text, a rough signal of
 * coverage sentiment, not a measure of the company's conduct.
 */
export const gdeltSource: DataSource = async (companyName) => {
  const q = encodeURIComponent(`"${companyName}" sourcelang:eng`);

  const list = await fetchJson<ArtListResponse>(
    `${BASE}?query=${q}&mode=artlist&maxrecords=25&format=json&timespan=3months&sort=hybridrel`,
    GDELT_OPTS
  );
  const articles = (list.articles ?? []).filter((a) => containsName(a.title, companyName));
  if (articles.length === 0) return { kind: "no_results" };

  let toneLine = "Average tone: unavailable.";
  try {
    const tone = await fetchJson<ToneResponse>(
      `${BASE}?query=${q}&mode=timelinetone&format=json&timespan=3months`,
      GDELT_OPTS
    );
    const values = (tone.timeline?.[0]?.data ?? []).map((d) => d.value).filter((v) => Number.isFinite(v));
    if (values.length >= 4) {
      const half = Math.floor(values.length / 2);
      const early = mean(values.slice(0, half));
      const late = mean(values.slice(half));
      const direction = late - early > 0.5 ? "improving" : late - early < -0.5 ? "worsening" : "steady";
      toneLine = `Average tone of coverage over the last 3 months: ${mean(values).toFixed(1)} (scale roughly -10 negative to +10 positive); trend ${direction} (${early.toFixed(1)} earlier, ${late.toFixed(1)} more recently).`;
    } else if (values.length > 0) {
      toneLine = `Average tone of coverage over the last 3 months: ${mean(values).toFixed(1)} (scale roughly -10 negative to +10 positive).`;
    }
  } catch {
    // Headlines alone are still useful; the tone call is the part GDELT rate-limits most.
  }

  const domains = new Set(articles.map((a) => a.domain));
  const lines = [
    `Recent news coverage of "${companyName}" (GDELT, last 3 months): ${articles.length} headlines naming it, from ${domains.size} outlet(s).`,
    toneLine,
    "Sample headlines:",
    ...articles.slice(0, 8).map((a) => `- "${clip(a.title, 120)}" (${a.domain}, ${gdeltDate(a.seendate)}) ${a.url}`),
    "Note: tone is an automated score of article text and reflects how coverage is worded, not whether the company did something wrong.",
  ];

  const pageUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&timespan=3months`;
  return {
    kind: "ok",
    detail: `${articles.length} headlines from ${domains.size} outlets`,
    pages: [
      {
        url: pageUrl,
        title: `GDELT news coverage: ${companyName}`,
        confidence: "medium",
        matchedOn: ["exact-name-match"],
      },
    ],
    findings: [{ url: pageUrl, text: lines.join("\n"), redacted: true }],
  };
};
