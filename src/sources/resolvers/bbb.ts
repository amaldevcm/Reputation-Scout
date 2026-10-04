import * as cheerio from "cheerio";
import { fetchRawHtml } from "../../fetch/httpFetch.js";
import { scoreMatch } from "../../pipeline/disambiguate.js";
import type { MatchedPage } from "../../types.js";
import type { Resolver } from "./types.js";

/**
 * BBB's own search page (bbb.org/search?find_text=) is a predictable URL
 * that returns real, unblocked HTML with plain <a href="/…/profile/…">
 * links — verified to work via a plain fetch (no headless browser). Using
 * it directly skips the external search-engine step (Brave/DuckDuckGo)
 * entirely for this source.
 */
export const bbbResolver: Resolver = async (companyName, hints) => {
  const url = new URL("https://www.bbb.org/search");
  url.searchParams.set("find_text", companyName);
  if (hints.location) url.searchParams.set("find_loc", hints.location);

  const { status, html, botChecked } = await fetchRawHtml(url.toString());
  if (botChecked) {
    throw new Error("BBB search page returned a bot-check page instead of results");
  }
  if (status >= 400) {
    throw new Error(`BBB search error: HTTP ${status}`);
  }

  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const matches: MatchedPage[] = [];

  $('a[href*="/profile/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const absolute = href.startsWith("http") ? href : `https://www.bbb.org${href}`;
    if (seen.has(absolute)) return;
    seen.add(absolute);

    const title = $(el).text().trim() || undefined;
    const { confidence, matchedOn } = scoreMatch(companyName, hints, { title, url: absolute });
    matches.push({ url: absolute, title, confidence, matchedOn });
  });

  return matches.slice(0, 3);
};
