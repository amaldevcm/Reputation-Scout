import path from "node:path";

export const BRAVE_API_KEY = process.env.BRAVE_API_KEY ?? "";
export const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";
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
