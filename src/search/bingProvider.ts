import * as cheerio from "cheerio";
import { throttleHost, hostnameOf } from "../fetch/throttle.js";
import { BROWSER_UA, isBotChecked } from "../fetch/httpFetch.js";
import type { SearchProvider, SearchResult } from "./types.js";

/**
 * Key-free search by scraping Bing's HTML results page. Bing serves plain
 * server-rendered results to a browser-like client and tolerated a 15-query
 * back-to-back burst in testing. It is unofficial: the markup can change and
 * heavy use can get an IP challenged, which is why this sits in a failover
 * chain rather than standing alone.
 */

const ENDPOINT = "https://www.bing.com/search";

/**
 * Bing ignores the site: operator on this endpoint and pads the page with
 * unrelated links instead, so the search chain only sends it queries without
 * one. It also never reports "no results" (a nonsense query still returns
 * five links), so callers must judge relevance themselves.
 */
export function bingHandles(query: string): boolean {
  return !/\bsite:/i.test(query);
}

/**
 * Bing wraps outbound links as bing.com/ck/a?...&u=a1<base64url of the real URL>.
 * Anything that isn't a wrapped link is returned unchanged.
 */
function decodeBingRedirect(href: string): string {
  try {
    const encoded = new URL(href).searchParams.get("u");
    if (encoded?.startsWith("a1")) {
      const real = Buffer.from(encoded.slice(2), "base64url").toString("utf-8");
      if (/^https?:\/\//.test(real)) return real;
    }
  } catch {
    // not a URL we can parse; fall through
  }
  return href;
}

export const bingProvider: SearchProvider = {
  name: "bing",
  async search(query: string, count = 10): Promise<SearchResult[]> {
    await throttleHost(hostnameOf(ENDPOINT));

    const url = `${ENDPOINT}?${new URLSearchParams({ q: query, setlang: "en", cc: "us" })}`;
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Bing search error: HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $("li.b_algo").each((_, el) => {
      if (results.length >= count) return;
      const link = $(el).find("h2 a").first();
      const href = link.attr("href");
      if (!href) return;
      const snippet = $(el).find(".b_caption p, p").first().text().replace(/\s+/g, " ").trim();
      results.push({ url: decodeBingRedirect(href), title: link.text().trim(), snippet });
    });

    // An empty page is only an error when it looks like a challenge page; otherwise it's a genuine miss.
    if (results.length === 0 && isBotChecked(html)) {
      throw new Error("Bing returned a bot-check page instead of results");
    }
    return results;
  },
};
