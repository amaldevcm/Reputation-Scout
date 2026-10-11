# Implementation brief: free-tier provider chains

Hand this file to a new Claude Code session: "Implement docs/free-tier-provider-chains.md".

## Goal

Replace the single search-then-fetch path with **per-source provider chains** that use only
free tiers. Each source tries its providers in order and stops at the first one that returns
usable content. Must still run with zero API keys (keyless providers only).

## Constraints

- **Free tiers only.** No provider that needs a card or paid plan (no Brave, Wextractor, DataForSEO).
- Every keyed provider is **optional**: missing env var → provider is skipped, never an error.
- Keep existing free public-record sources (`src/sources/apis/*`: cfpb, edgar, courtlistener,
  hackernews, gdelt, appstore) unchanged.
- Keep existing behavior flags: `REPSCOUT_HOSTED_SEARCH`, `REPSCOUT_HOSTED_SCRAPE`, `REPSCOUT_JINA_FALLBACK`.
- Hosted scraping of ToS-restricted sites (Glassdoor, G2, Indeed, LinkedIn) stays **opt-in**
  behind `REPSCOUT_HOSTED_SCRAPE=true` (applies to Apify and Bright Data too).
- Match existing code style (TypeScript ESM, `.js` import suffixes, small modules, sparse comments).

## Free tiers to use

| Provider | Env var | Free allowance | Resets |
|---|---|---|---|
| Apify (actors) | `APIFY_TOKEN` | $5 usage/month | monthly |
| Bright Data (Web Unlocker / MCP) | `BRIGHTDATA_API_TOKEN` | ~5,000 req/month | monthly |
| Tavily | `TAVILY_API_KEY` | 1,000 credits | monthly |
| Firecrawl | `FIRECRAWL_API_KEY` (optional; keyless already used) | ~500–1,000 credits | monthly |
| SerpApi | `SERPAPI_KEY` | 250 searches | monthly |
| Yelp Fusion | `YELP_API_KEY` | 5,000 calls/day | daily |
| Serper | `SERPER_API_KEY` | 2,500 searches | one-time |
| Parallel, Jina, Bing, DuckDuckGo | none | free | — |

Verify each provider's current API shape and free allowance against its official docs before coding.

## Architecture

### 1. Provider adapters — `src/providers/`

One file per vendor. Common interface in `src/providers/types.ts`:

```ts
export type ProviderOutcome =
  | { kind: "reviews"; reviews: Review[]; url?: string }   // structured (Apify, SerpApi, Yelp)
  | { kind: "page"; url: string; markdown: string }         // raw content (Firecrawl, Jina, Bright Data)
  | { kind: "empty" }
  | { kind: "error"; reason: FailureReason; message: string };

export interface ReviewProvider {
  name: string;
  enabled(): boolean;                       // key present + flags allow + quota left
  fetchReviews(ctx: SourceContext): Promise<ProviderOutcome>;
}
```

Add `Review` (`rating?`, `title?`, `text`, `date?`, `url?`) to `src/types.ts`. Reuse
`FailureReason` from `src/pipeline/failure.ts`.

Adapters to build:
- `apify.ts` — generic runner (`run-sync-get-dataset-items`) + per-source actor IDs in config;
  pass `maxItems` cap. Pick actors with pay-per-result pricing; record chosen IDs in README.
- `brightdata.ts` — Web Unlocker fetch returning markdown.
- `serpapi.ts` — Google Maps reviews engine.
- `yelp.ts` — Fusion business search + reviews (only 3 reviews; label as such).
- `serper.ts` — new search provider (implements existing `SearchProvider`).
- Wrap existing `firecrawlReader.ts`, `jinaReader.ts`, direct `httpFetch.ts`, and the
  search-preview path as providers instead of duplicating them.

### 2. Chains — `src/sources/chains.ts`

Config only:

| Source | Chain (in order) |
|---|---|
| glassdoor | apify → brightdata → firecrawl → searchPreview |
| indeed | apify → brightdata → firecrawl → searchPreview |
| g2 | apify → firecrawl → brightdata → searchPreview |
| trustpilot | apify → firecrawl → jina |
| google_reviews | serpapi → apify |
| yelp (new source) | yelp → apify |
| bbb, sitejabber | direct → jina → firecrawl |
| reddit | searchPreview → apify |
| linkedin | brightdata → searchPreview |
| clutch | direct → jina → firecrawl → searchPreview |

Sources not listed keep current behavior.

### 3. Shared search chain — `src/search/index.ts`

New order: Tavily → Parallel → Firecrawl → Serper → Bing → DuckDuckGo. Keep existing
cool-down skip logic.

### 4. Shared page-fetch chain — `src/fetch/fetchPage.ts`

direct → Jina → Firecrawl → Bright Data.

### 5. Quota tracker — `src/providers/quota.ts`

- Persist per-provider usage to `CACHE_DIR/quota.json`, keyed by provider + period (month/day/one-time).
- Limits from env with defaults matching the table above (e.g. `REPSCOUT_QUOTA_APIFY_USD=5`).
- `enabled()` returns false when exhausted; report it as `skipped: quota exhausted`.
- Count only successful/billed calls.

### 6. Pipeline — `src/pipeline/runSources.ts`

- For a source with a chain: walk providers; on `error`/`empty` mark provider cool-down
  (generalize the search cool-down) and try next.
- `reviews` → format into findings directly; `page` → existing `extractSignals` path.
- Record in manifest which provider served the source; show it in the report.
- Cache results per (source, provider, company) via `pageCache` so reruns cost nothing.
- Cap reviews per source: `REPSCOUT_MAX_REVIEWS_PER_SOURCE` (default 30).

## Done when

1. `npm run build` passes; existing tests (if any) pass.
2. With **no keys**: run behaves at least as well as today (keyless providers only).
3. With keys: each new adapter verified against one real company (e.g. a well-known SaaS firm),
   confirming review text comes back; note any adapter that failed.
4. Quota file increments and a provider is skipped once its limit is hit (test by setting a tiny limit).
5. Report shows the serving provider per source.
6. README updated: provider table, env vars, chains, free-tier limits, ToS note for opt-in scraping.
7. Commit in small steps (adapters, chains, quota, pipeline, docs).
