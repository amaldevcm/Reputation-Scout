import { throttleHost, hostnameOf } from "../fetch/throttle.js";
import { DEFAULT_UA } from "../fetch/httpFetch.js";
import { FIRECRAWL_API_KEY } from "../config.js";
import { hasQuota, recordUsage } from "../providers/quota.js";
import type { SearchProvider, SearchResult } from "./types.js";

/**
 * Firecrawl's search endpoint used without an API key (its keyless tier). The
 * cap is per IP and Firecrawl does not publish the number, so treat a 429 or
 * 402 as "out of free searches for now". The query is sent to Firecrawl.
 */

const ENDPOINT = "https://api.firecrawl.dev/v2/search";
const SNIPPET_CHARS = 300;
const EXCERPT_CHARS = 4000;

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: { web?: { url: string; title?: string; description?: string }[] };
}

export const firecrawlProvider: SearchProvider = {
  name: "firecrawl",
  async search(query: string, count = 10): Promise<SearchResult[]> {
    if (FIRECRAWL_API_KEY && !hasQuota("firecrawl")) throw new Error("Firecrawl quota exhausted");
    await throttleHost(hostnameOf(ENDPOINT));

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": DEFAULT_UA,
        ...(FIRECRAWL_API_KEY && { Authorization: `Bearer ${FIRECRAWL_API_KEY}` }),
      },
      body: JSON.stringify({ query, limit: count }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) throw new Error(`Firecrawl search error: HTTP ${res.status}`);

    const data = (await res.json()) as FirecrawlSearchResponse;
    if (!data.success) throw new Error("Firecrawl search error: request was not successful");

    if (FIRECRAWL_API_KEY) recordUsage("firecrawl");
    return (data.data?.web ?? []).slice(0, count).map((r) => {
      const description = (r.description ?? "").trim();
      return {
        url: r.url,
        title: r.title ?? "",
        snippet: description.replace(/\s+/g, " ").slice(0, SNIPPET_CHARS),
        excerpt: description.slice(0, EXCERPT_CHARS) || undefined,
      };
    });
  },
};
