import { JINA_FALLBACK_ENABLED, HOSTED_SCRAPE_ENABLED, FIRECRAWL_API_KEY } from "../config.js";
import { fetchPage } from "../fetch/fetchPage.js";
import { fetchViaJina, type ReaderOutcome } from "../fetch/jinaReader.js";
import { fetchViaFirecrawl } from "../fetch/firecrawlReader.js";
import { getCached, setCached } from "../fetch/pageCache.js";
import { redditSource } from "../sources/apis/reddit.js";
import { hasQuota } from "./quota.js";
import { errorOutcome } from "./util.js";
import type { PageContent, ProviderOutcome, ReviewProvider, SourceContext } from "./types.js";

const MAX_PAGES = 3;

type PageResult =
  | { kind: "ok"; text: string }
  | { kind: "blocked" | "failed"; message: string }
  | { kind: "none" };

/** Reads each candidate page with one reader and folds the per-page results into a provider outcome. */
async function readPages(ctx: SourceContext, read: (url: string) => Promise<PageResult>): Promise<ProviderOutcome> {
  const matched = (await ctx.pages()).slice(0, MAX_PAGES);
  const pages: PageContent[] = [];
  let blocked: string | null = null;
  let failed: string | null = null;

  for (const page of matched) {
    const r = await read(page.url);
    if (r.kind === "ok") pages.push({ url: page.url, markdown: r.text });
    else if (r.kind === "blocked") blocked = r.message;
    else if (r.kind === "failed") failed = r.message;
  }

  if (pages.length > 0) return { kind: "pages", pages, matched };
  if (blocked) return { kind: "error", reason: "bot_blocked", message: blocked };
  if (failed) return { kind: "error", reason: "service_down", message: failed };
  return { kind: "empty" };
}

const fromReader = (outcome: ReaderOutcome | null): PageResult =>
  outcome?.kind === "ok" ? { kind: "ok", text: outcome.text } : { kind: "none" };

/** Plain fetch with no reader fallbacks, so the chain decides what comes next. */
export const directProvider: ReviewProvider = {
  name: "direct",
  enabled: () => true,
  async fetchReviews(ctx) {
    try {
      return await readPages(ctx, async (url) => {
        const o = await fetchPage(url, { fallbacks: false });
        if (o.kind === "ok") return { kind: "ok", text: o.text };
        if (o.kind === "blocked") return { kind: "blocked", message: o.reason };
        if (o.kind === "failed" || o.kind === "parse_error") return { kind: "failed", message: o.reason };
        return { kind: "none" };
      });
    } catch (err) {
      return errorOutcome(err);
    }
  },
};

export const jinaProvider: ReviewProvider = {
  name: "jina",
  enabled: () => JINA_FALLBACK_ENABLED,
  async fetchReviews(ctx) {
    try {
      return await readPages(ctx, async (url) => fromReader(await fetchViaJina(url)));
    } catch (err) {
      return errorOutcome(err);
    }
  },
};

/** Hosted scrape: opt-in, because it can read sites whose terms forbid automated access. */
export const firecrawlScrapeProvider: ReviewProvider = {
  name: "firecrawl",
  quotaKey: "firecrawl",
  enabled: () => HOSTED_SCRAPE_ENABLED && (!FIRECRAWL_API_KEY || hasQuota("firecrawl")),
  async fetchReviews(ctx) {
    try {
      return await readPages(ctx, async (url) => fromReader(await fetchViaFirecrawl(url)));
    } catch (err) {
      return errorOutcome(err);
    }
  },
};

/**
 * Last resort: reads the pages the search turned up through the normal reader
 * ladder, and where a page can't be read falls back to the search engine's own
 * excerpt of it.
 */
export const searchPreviewProvider: ReviewProvider = {
  name: "searchPreview",
  enabled: () => true,
  async fetchReviews(ctx) {
    try {
      const { results } = await ctx.search().catch(() => ({ results: [] }));
      const matched = (await ctx.pages()).slice(0, MAX_PAGES);
      const pages: PageContent[] = [];

      for (const page of matched) {
        const fetched = await fetchPage(page.url);
        if (fetched.kind === "ok") {
          pages.push({ url: page.url, markdown: fetched.text });
          continue;
        }
        const hit = results.find((r) => r.url === page.url);
        const preview = hit?.excerpt ?? hit?.snippet;
        if (preview) pages.push({ url: page.url, markdown: `Search preview (page not readable): ${preview}` });
      }
      return pages.length ? { kind: "pages", pages, matched } : { kind: "empty" };
    } catch (err) {
      return errorOutcome(err);
    }
  },
};

/** Reddit blocks direct reads, so its "search preview" is the thread list built from search results. */
export const redditPreviewProvider: ReviewProvider = {
  name: "searchPreview",
  enabled: () => true,
  async fetchReviews(ctx) {
    try {
      const r = await redditSource(ctx.companyName, ctx.hints);
      if (r.kind !== "ok") return { kind: "empty" };
      return {
        kind: "pages",
        pages: r.findings.map((f) => ({ url: f.url, markdown: f.text })),
        matched: r.pages,
        detail: r.detail,
      };
    } catch (err) {
      return errorOutcome(err);
    }
  },
};
