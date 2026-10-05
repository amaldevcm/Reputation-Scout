import { throttleHost } from "./throttle.js";
import { DEFAULT_UA, isBotChecked } from "./httpFetch.js";
import { MIN_READER_TEXT_LENGTH, looksLikeNotFound, type ReaderOutcome } from "./jinaReader.js";

const SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const FIRECRAWL_HOST = "api.firecrawl.dev";

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: { markdown?: string; metadata?: { statusCode?: number; title?: string } };
}

/**
 * Opt-in page reader (REPSCOUT_HOSTED_SCRAPE=true) that asks Firecrawl's
 * keyless tier to fetch and clean a page. In testing it returned real review
 * content for G2 and Glassdoor, which no other free route could read. Those
 * sites' terms forbid automated access, which is why this is off by default.
 * The URL is sent to Firecrawl.
 *
 * Returns null when Firecrawl can't get usable content (out of free quota,
 * still blocked, or an empty page).
 */
export async function fetchViaFirecrawl(url: string): Promise<ReaderOutcome | null> {
  await throttleHost(FIRECRAWL_HOST);

  try {
    const res = await fetch(SCRAPE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": DEFAULT_UA },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;

    const payload = (await res.json()) as FirecrawlScrapeResponse;
    if (!payload.success) return null;

    if (payload.data?.metadata?.statusCode === 404) return { kind: "not_found" };

    const markdown = payload.data?.markdown?.trim() ?? "";
    if (markdown.length < MIN_READER_TEXT_LENGTH) return null;
    if (looksLikeNotFound(markdown)) return { kind: "not_found" };
    if (isBotChecked(markdown)) return null;

    const title = payload.data?.metadata?.title?.trim();
    return { kind: "ok", text: title ? `${title}\n\n${markdown}` : markdown };
  } catch {
    return null;
  }
}
