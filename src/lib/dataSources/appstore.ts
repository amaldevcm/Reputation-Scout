import { fetchJson } from "./http.js";
import { matchName } from "./match.js";
import { normalizeDomain } from "../domain.js";
import { num, clip } from "./format.js";
import type { MatchedPage } from "../types.js";
import type { DataSource } from "./types.js";

interface ItunesApp {
  trackId: number;
  trackName: string;
  artistName: string;
  sellerUrl?: string;
  trackViewUrl: string;
  averageUserRating?: number;
  userRatingCount?: number;
}
interface SearchResponse {
  results: ItunesApp[];
}
interface Label {
  label: string;
}
interface FeedEntry {
  "im:rating"?: Label;
  title?: Label;
  content?: Label;
  updated?: Label;
}
interface ReviewFeed {
  feed?: { entry?: FeedEntry | FeedEntry[] };
}

const MAX_APPS = 2;

/** One app's recent-review digest from Apple's public customer-reviews RSS feed (last 50 reviews). */
async function recentReviewDigest(app: ItunesApp): Promise<string[]> {
  const feed = await fetchJson<ReviewFeed>(
    `https://itunes.apple.com/us/rss/customerreviews/page=1/id=${app.trackId}/sortBy=mostRecent/json`
  );
  const raw = feed.feed?.entry;
  const entries = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((e) => e["im:rating"]);
  if (entries.length === 0) return [];

  const ratings = entries.map((e) => Number(e["im:rating"]!.label)).filter((n) => Number.isFinite(n));
  const dates = entries.map((e) => e.updated?.label?.slice(0, 10)).filter((d): d is string => Boolean(d)).sort();
  const lowStar = entries.filter((e) => Number(e["im:rating"]!.label) <= 2);
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;

  const lines = [
    `  Last ${ratings.length} reviews (${dates[0]} to ${dates[dates.length - 1]}): average ${avg.toFixed(1)}/5, ${lowStar.length} rated 1-2 stars.`,
  ];
  for (const e of lowStar.slice(0, 2)) {
    lines.push(`  - ${e["im:rating"]!.label} star: "${clip(`${e.title?.label ?? ""}: ${e.content?.label ?? ""}`, 220)}"`);
  }
  return lines;
}

/**
 * Apple App Store ratings and recent reviews for apps published by the
 * company, via the free iTunes Search API and customer-reviews RSS feed. The
 * feed only exposes the most recent reviews, so the digest is a recency
 * signal, not the app's full review history. Google Play isn't covered.
 */
export const appStoreSource: DataSource = async (companyName, hints) => {
  const search = await fetchJson<SearchResponse>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(companyName)}&entity=software&country=us&limit=25`
  );

  const apps = search.results
    .map((app) => ({ app, match: matchName(companyName, app.artistName) }))
    .filter((c) => c.match !== "none")
    .sort((a, b) => (b.app.userRatingCount ?? 0) - (a.app.userRatingCount ?? 0))
    .slice(0, MAX_APPS);
  if (apps.length === 0) return { kind: "no_results" };

  const pages: MatchedPage[] = [];
  const blocks: string[] = [];
  let domainConfirmed = false;

  for (const { app, match } of apps) {
    const domain = hints.domain ? normalizeDomain(hints.domain) : undefined;
    const domainMatch = Boolean(domain && app.sellerUrl?.toLowerCase().includes(domain));
    domainConfirmed ||= domainMatch;

    const matchedOn = [`publisher:${app.artistName}`, match === "exact" ? "exact-name-match" : "partial-name-match"];
    if (domainMatch) matchedOn.push(`domain:${hints.domain}`);
    pages.push({
      url: app.trackViewUrl,
      title: `${app.trackName} (App Store)`,
      confidence: domainMatch ? "high" : match === "exact" ? "medium" : "low",
      matchedOn,
    });

    const rating =
      app.averageUserRating !== undefined
        ? `${app.averageUserRating.toFixed(1)}/5 from ${num(app.userRatingCount ?? 0)} ratings`
        : "no rating yet";
    const block = [`${app.trackName} (publisher: ${app.artistName}): ${rating}.`];
    try {
      block.push(...(await recentReviewDigest(app)));
    } catch {
      block.push("  Recent reviews unavailable.");
    }
    blocks.push(block.join("\n"));
  }

  const text = [
    `Apple App Store apps published by "${apps[0].app.artistName}" (US storefront):`,
    ...blocks,
    "Note: the review feed shows only the latest reviews, so it reflects recent sentiment rather than the app's whole history. Google Play is not covered.",
  ].join("\n");

  return {
    kind: "ok",
    detail: `${apps.length} app(s)${domainConfirmed ? ", domain confirmed" : ""}`,
    pages,
    findings: [{ url: pages[0].url, text, redacted: true }],
  };
};
