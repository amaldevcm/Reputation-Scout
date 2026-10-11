import { SERPAPI_KEY, MAX_REVIEWS_PER_SOURCE } from "../config.js";
import { hasQuota, recordUsage } from "./quota.js";
import { clipText, errorOutcome, httpError } from "./util.js";
import type { Review } from "../types.js";
import type { ProviderOutcome, ReviewProvider, SourceContext } from "./types.js";

const ENDPOINT = "https://serpapi.com/search.json";

async function call(params: Record<string, string>): Promise<any> {
  const res = await fetch(`${ENDPOINT}?${new URLSearchParams({ ...params, api_key: SERPAPI_KEY })}`, {
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw Object.assign(new Error(`serpapi: HTTP ${res.status}`), { status: res.status });
  recordUsage("serpapi");
  return res.json();
}

/** Google Maps reviews: one search to find the place, then the reviews engine (2 searches). */
export const serpApiProvider: ReviewProvider = {
  name: "serpapi",
  enabled: () => Boolean(SERPAPI_KEY) && hasQuota("serpapi"),
  async fetchReviews(ctx: SourceContext): Promise<ProviderOutcome> {
    try {
      const q = [ctx.companyName, ctx.hints.location].filter(Boolean).join(" ");
      const found = await call({ engine: "google_maps", type: "search", q });
      const place = found.place_results ?? found.local_results?.[0];
      if (!place?.data_id) return { kind: "empty" };

      const data = await call({
        engine: "google_maps_reviews",
        data_id: place.data_id,
        num: String(Math.min(20, MAX_REVIEWS_PER_SOURCE)),
        hl: "en",
      });
      const reviews: Review[] = (data.reviews ?? [])
        .map((r: any) => ({
          text: clipText(r.extracted_snippet?.original ?? r.snippet ?? ""),
          rating: typeof r.rating === "number" ? r.rating : undefined,
          date: r.iso_date ?? r.date,
          url: r.link,
        }))
        .filter((r: Review) => r.text);
      if (reviews.length === 0) return { kind: "empty" };
      const rating = place.rating ? `, ${place.rating}/5` : "";
      return { kind: "reviews", reviews, url: place.link, detail: `${place.title ?? "place"}${rating}` };
    } catch (err: any) {
      return err?.status ? httpError("serpapi", err.status) : errorOutcome(err);
    }
  },
};
