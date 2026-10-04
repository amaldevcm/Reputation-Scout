import * as cheerio from "cheerio";
import { throttleHost, hostnameOf } from "../fetch/throttle.js";
import { DEFAULT_UA, isBotChecked } from "../fetch/httpFetch.js";
import type { SearchProvider, SearchResult } from "./types.js";

/**
 * Key-free fallback used when BRAVE_API_KEY isn't set. Scrapes DuckDuckGo's
 * plain HTML results endpoint (no official API, no key) rather than the JS
 * front end. Same politeness throttle as any other fetched host. This is
 * unofficial and fragile by nature (markup changes, rate limits) — it exists
 * so the tool has zero-config coverage, not as a replacement for Brave.
 */

const ENDPOINT = "https://html.duckduckgo.com/html/";

function decodeDdgRedirect(href: string): string {
  // DDG's HTML results wrap outbound links as //duckduckgo.com/l/?uddg=<encoded>&rut=...
  try {
    const url = href.startsWith("//") ? `https:${href}` : href;
    const parsed = new URL(url);
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return href;
  } catch {
    return href;
  }
}

export const duckduckgoProvider: SearchProvider = {
  name: "duckduckgo",
  async search(query: string, count = 10): Promise<SearchResult[]> {
    await throttleHost(hostnameOf(ENDPOINT));

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": DEFAULT_UA,
      },
      body: new URLSearchParams({ q: query }).toString(),
    });

    if (!res.ok) {
      throw new Error(`DuckDuckGo search error: HTTP ${res.status}`);
    }

    const html = await res.text();
    if (isBotChecked(html)) {
      throw new Error(
        "DuckDuckGo returned a bot-check/anomaly page instead of results (unofficial endpoint, no key — this is expected to happen under repeated or heavy use). Set BRAVE_API_KEY to avoid this."
      );
    }

    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $(".result").each((_, el) => {
      if (results.length >= count) return;
      const linkEl = $(el).find("a.result__a").first();
      const href = linkEl.attr("href");
      if (!href) return;
      const title = linkEl.text().trim();
      const snippet = $(el).find(".result__snippet").first().text().trim();
      results.push({ url: decodeDdgRedirect(href), title, snippet });
    });

    return results;
  },
};
