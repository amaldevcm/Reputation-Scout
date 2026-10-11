import { BRIGHTDATA_API_TOKEN, BRIGHTDATA_ZONE, HOSTED_SCRAPE_ENABLED } from "../config.js";
import { hasQuota, recordUsage } from "./quota.js";
import { errorOutcome } from "./util.js";
import { MIN_READER_TEXT_LENGTH, looksLikeNotFound, type ReaderOutcome } from "../fetch/jinaReader.js";
import { isBotChecked } from "../fetch/httpFetch.js";
import type { ProviderOutcome, ReviewProvider, SourceContext } from "./types.js";

/** Web Unlocker needs a token and a zone; like all hosted scraping it is opt-in. */
export function brightDataEnabled(): boolean {
  return Boolean(BRIGHTDATA_API_TOKEN && BRIGHTDATA_ZONE) && HOSTED_SCRAPE_ENABLED && hasQuota("brightdata");
}

/** Bright Data Web Unlocker fetch returning markdown. Null when it couldn't get usable content. */
export async function fetchViaBrightData(url: string): Promise<ReaderOutcome | null> {
  const res = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRIGHTDATA_API_TOKEN}` },
    body: JSON.stringify({ zone: BRIGHTDATA_ZONE, url, format: "raw", data_format: "markdown" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`brightdata: HTTP ${res.status}`);
  recordUsage("brightdata");
  const text = (await res.text()).trim();
  if (text.length < MIN_READER_TEXT_LENGTH || isBotChecked(text)) return null;
  if (looksLikeNotFound(text)) return { kind: "not_found" };
  return { kind: "ok", text };
}

export const brightDataProvider: ReviewProvider = {
  name: "brightdata",
  quotaKey: "brightdata",
  enabled: brightDataEnabled,
  async fetchReviews(ctx: SourceContext): Promise<ProviderOutcome> {
    const matched = (await ctx.pages()).slice(0, 3);
    const pages: { url: string; markdown: string }[] = [];
    try {
      for (const page of matched) {
        const r = await fetchViaBrightData(page.url);
        if (r?.kind === "ok") pages.push({ url: page.url, markdown: r.text });
      }
    } catch (err) {
      if (pages.length === 0) return errorOutcome(err);
    }
    return pages.length ? { kind: "pages", pages, matched } : { kind: "empty" };
  },
};
