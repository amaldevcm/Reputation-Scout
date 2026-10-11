import { YELP_API_KEY } from "../config.js";
import { hasQuota, recordUsage } from "./quota.js";
import { clipText, errorOutcome, httpError } from "./util.js";
import type { Review } from "../types.js";
import type { ProviderOutcome, ReviewProvider, SourceContext } from "./types.js";

const BASE = "https://api.yelp.com/v3";

async function get(path: string, params: Record<string, string>): Promise<Response> {
  const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${YELP_API_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.ok) recordUsage("yelp");
  return res;
}

/** Yelp Fusion: business search, then reviews. Yelp returns at most 3 review excerpts. */
export const yelpProvider: ReviewProvider = {
  name: "yelp",
  quotaKey: "yelp",
  enabled: () => Boolean(YELP_API_KEY) && hasQuota("yelp"),
  async fetchReviews(ctx: SourceContext): Promise<ProviderOutcome> {
    // Search needs a location; without one there is nothing reliable to match on.
    if (!ctx.hints.location) return { kind: "empty" };
    try {
      const search = await get("/businesses/search", {
        term: ctx.companyName,
        location: ctx.hints.location,
        limit: "1",
      });
      if (!search.ok) return httpError("yelp", search.status);
      const biz = ((await search.json()) as any).businesses?.[0];
      if (!biz?.id) return { kind: "empty" };

      const res = await get(`/businesses/${biz.id}/reviews`, { limit: "3", sort_by: "yelp_sort" });
      if (!res.ok) return httpError("yelp", res.status);
      const reviews: Review[] = (((await res.json()) as any).reviews ?? [])
        .map((r: any) => ({ text: clipText(r.text ?? ""), rating: r.rating, date: r.time_created, url: r.url }))
        .filter((r: Review) => r.text);
      if (reviews.length === 0) return { kind: "empty" };
      return {
        kind: "reviews",
        reviews,
        url: biz.url,
        detail: `${biz.name}, ${biz.rating}/5 over ${biz.review_count} reviews; the Yelp API returns only 3 excerpts`,
      };
    } catch (err) {
      return errorOutcome(err);
    }
  },
};
