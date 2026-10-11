import path from "node:path";

export const BRAVE_API_KEY = process.env.BRAVE_API_KEY ?? "";
export const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";
// Optional contact address added to the User-Agent of public-API calls (the
// SEC in particular asks automated clients to identify themselves).
export const CONTACT_EMAIL = process.env.REPSCOUT_CONTACT_EMAIL ?? "";
export const JINA_API_KEY = process.env.JINA_API_KEY ?? "";
// Jina Reader fallback for bot-walled pages; sends the target URL to r.jina.ai.
export const JINA_FALLBACK_ENABLED = process.env.REPSCOUT_JINA_FALLBACK !== "false";
// Hosted key-free search (Parallel, Firecrawl): on by default, but the query is
// sent to those services. Set REPSCOUT_HOSTED_SEARCH=false to keep searches local.
export const HOSTED_SEARCH_ENABLED = process.env.REPSCOUT_HOSTED_SEARCH !== "false";
// Hosted page scrape (Firecrawl): opt-in. It can read sites (G2, Glassdoor) whose
// terms forbid automated access, so it stays off until explicitly enabled.
export const HOSTED_SCRAPE_ENABLED = process.env.REPSCOUT_HOSTED_SCRAPE === "true";
export const CACHE_DIR = process.env.REPSCOUT_CACHE_DIR ?? path.resolve(".cache");
export const REPORTS_DIR = process.env.REPSCOUT_REPORTS_DIR ?? path.resolve("reports");
export const RUNS_DIR = path.join(CACHE_DIR, "runs");
export const PAGE_CACHE_DIR = path.join(CACHE_DIR, "pages");
export const CACHE_TTL_MS = Number(process.env.REPSCOUT_CACHE_TTL_MS ?? 1000 * 60 * 60 * 24 * 7); // 7 days
export const REDACT_NAMES_DEFAULT = process.env.REPSCOUT_REDACT_NAMES !== "false";
export const MIN_VIABLE_SOURCES = 2;

// Per-host politeness: min ms between requests to the same hostname.
export const PER_HOST_DELAY_MS = Number(process.env.REPSCOUT_PER_HOST_DELAY_MS ?? 2500);

// Brave Search API published rate limit (requests per second). Conservative default.
export const BRAVE_RPS = Number(process.env.REPSCOUT_BRAVE_RPS ?? 1);

export const MAX_FETCH_RETRIES = 2;

// Optional free-tier provider keys. A missing key just leaves that provider out of its chains.
export const APIFY_TOKEN = process.env.APIFY_TOKEN ?? "";
export const BRIGHTDATA_API_TOKEN = process.env.BRIGHTDATA_API_TOKEN ?? "";
// Web Unlocker zone name (created in the Bright Data control panel).
export const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE ?? "";
export const SERPAPI_KEY = process.env.SERPAPI_KEY ?? "";
export const SERPER_API_KEY = process.env.SERPER_API_KEY ?? "";
export const YELP_API_KEY = process.env.YELP_API_KEY ?? "";
export const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY ?? "";

export const MAX_REVIEWS_PER_SOURCE = Number(process.env.REPSCOUT_MAX_REVIEWS_PER_SOURCE ?? 30);
// Rough Apify spend per returned item, used only to count usage against the $ budget.
export const APIFY_USD_PER_ITEM = Number(process.env.REPSCOUT_APIFY_USD_PER_ITEM ?? 0.005);
export const QUOTA_FILE = path.join(CACHE_DIR, "quota.json");
