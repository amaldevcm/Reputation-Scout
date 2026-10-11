import { APIFY_TOKEN, HOSTED_SCRAPE_ENABLED, MAX_REVIEWS_PER_SOURCE, APIFY_USD_PER_ITEM } from "../config.js";
import { hasQuota, recordUsage } from "./quota.js";
import { clipText, errorOutcome, httpError } from "./util.js";
import type { Review } from "../types.js";
import type { ProviderOutcome, ReviewProvider, SourceContext } from "./types.js";

/**
 * Apify actors, run through the synchronous `run-sync-get-dataset-items`
 * endpoint. Actor IDs and inputs are defaults picked from the Apify Store
 * (pay-per-result pricing); override per source with
 * REPSCOUT_APIFY_ACTOR_<SOURCE> and REPSCOUT_APIFY_INPUT_<SOURCE> (a JSON
 * template where {{url}}, {{company}}, {{companyEnc}}, {{domain}},
 * {{domainOrCompany}} and {{max}} are replaced). Actor input schemas change,
 * so check them on the actor's page.
 */
interface ActorSpec {
  actor: string;
  /** Needs a profile URL found by the resolver/search. */
  needsUrl?: boolean;
  /** Needs a company domain hint. */
  needsDomain?: boolean;
  input: string;
}

const ACTORS: Record<string, ActorSpec> = {
  glassdoor: {
    actor: "scrapifier~glassdoor-reviews-universal-scraper",
    needsUrl: true,
    input: '{"companyUrls":["{{url}}"],"companyNames":["{{company}}"],"maxReviews":{{max}}}',
  },
  indeed: {
    actor: "reviewly~indeed-company-reviews-scraper",
    needsUrl: true,
    input: '{"startUrls":[{"url":"{{url}}"}],"maxNumberOfReviews":{{max}}}',
  },
  g2: {
    actor: "jupri~g2-explorer",
    input: '{"query":"{{domainOrCompany}}","limit":{{max}}}',
  },
  trustpilot: {
    actor: "junipr~trustpilot-reviews-scraper",
    needsDomain: true,
    input: '{"startUrls":[{"url":"https://www.trustpilot.com/review/{{domain}}"}],"maxReviews":{{max}}}',
  },
  google_reviews: {
    actor: "compass~google-maps-reviews-scraper",
    input:
      '{"startUrls":[{"url":"https://www.google.com/maps/search/{{companyEnc}}"}],"maxReviews":{{max}},"language":"en"}',
  },
  yelp: {
    actor: "eunit~yelp-scraper",
    input: '{"searchTerm":"{{company}}","reviewLimit":{{max}}}',
  },
  reddit: {
    actor: "trudax~reddit-scraper-lite",
    input: '{"searches":["{{company}} reviews"],"maxItems":{{max}},"sort":"relevance"}',
  },
};

function fill(template: string, vars: Record<string, string>): unknown {
  const esc = (s: string) => JSON.stringify(s).slice(1, -1);
  return JSON.parse(template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => esc(vars[k] ?? "")));
}

const pick = (item: Record<string, any>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
};

function toReview(item: Record<string, any>): Review | null {
  const parts = [
    pick(item, ["text", "reviewText", "review", "body", "content", "snippet", "description"]),
    item.pros ? `Pros: ${item.pros}` : undefined,
    item.cons ? `Cons: ${item.cons}` : undefined,
  ].filter(Boolean) as string[];
  const text = parts.join(" ");
  if (!text) return null;
  const rating = Number(item.stars ?? item.rating ?? item.ratingValue ?? item.overallRating);
  return {
    text: clipText(text),
    title: pick(item, ["title", "headline", "summary"]),
    rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
    date: pick(item, ["publishedAtDate", "date", "createdAt", "reviewDate", "time_created"]),
    url: pick(item, ["reviewUrl", "url", "link"]),
  };
}

export const apifyProvider: ReviewProvider = {
  name: "apify",
  // Actors scrape sites whose terms forbid automation, so this shares the opt-in scrape flag.
  quotaKey: "apify",
  enabled: () => Boolean(APIFY_TOKEN) && HOSTED_SCRAPE_ENABLED && hasQuota("apify"),
  async fetchReviews(ctx: SourceContext): Promise<ProviderOutcome> {
    const key = ctx.source.toUpperCase();
    const spec = ACTORS[ctx.source];
    const actor = process.env[`REPSCOUT_APIFY_ACTOR_${key}`] ?? spec?.actor;
    if (!actor) return { kind: "empty" };
    const template = process.env[`REPSCOUT_APIFY_INPUT_${key}`] ?? spec?.input ?? "{}";

    const domain = (ctx.hints.domain ?? "")
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    if (spec?.needsDomain && !domain) return { kind: "empty" };

    let url = "";
    if (spec?.needsUrl) {
      url = (await ctx.pages())[0]?.url ?? "";
      if (!url) return { kind: "empty" };
    }

    let input: unknown;
    try {
      input = fill(template, {
        url,
        company: ctx.companyName,
        companyEnc: encodeURIComponent(ctx.companyName),
        domain,
        domainOrCompany: domain || ctx.companyName,
        max: String(MAX_REVIEWS_PER_SOURCE),
      });
    } catch (err) {
      return errorOutcome(err);
    }

    try {
      const params = new URLSearchParams({ maxItems: String(MAX_REVIEWS_PER_SOURCE), timeout: "240" });
      const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${APIFY_TOKEN}` },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(280_000),
      });
      if (!res.ok) return httpError("apify", res.status);
      const items = (await res.json()) as Record<string, any>[];
      if (!Array.isArray(items)) return { kind: "empty" };

      recordUsage("apify", items.length * APIFY_USD_PER_ITEM);
      const reviews = items.map(toReview).filter((r): r is Review => r !== null);
      return reviews.length === 0
        ? { kind: "empty" }
        : { kind: "reviews", reviews, url: url || undefined, detail: `actor ${actor}` };
    } catch (err) {
      return errorOutcome(err);
    }
  },
};
