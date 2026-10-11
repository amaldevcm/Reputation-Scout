import { TAVILY_API_KEY, BRAVE_API_KEY, SERPER_API_KEY, HOSTED_SEARCH_ENABLED } from "../config.js";
import { serperProvider } from "./serperProvider.js";
import { hasQuota, recordUsage } from "../providers/quota.js";
import { coolingDown, markFailed, resetHealth } from "../providers/health.js";
import { tavilyProvider } from "./tavilyProvider.js";
import { braveProvider } from "./braveProvider.js";
import { bingProvider, bingHandles } from "./bingProvider.js";
import { parallelProvider } from "./parallelProvider.js";
import { firecrawlProvider } from "./firecrawlProvider.js";
import { duckduckgoProvider } from "./duckduckgoProvider.js";
import { SourceFailure, classifyMessage, describeError } from "../pipeline/failure.js";
import type { SearchProvider, SearchResult } from "./types.js";

export type { SearchProvider, SearchResult };

interface ChainEntry {
  provider: SearchProvider;
  enabled: () => boolean;
  // An empty answer from an API is a real "no results". From a scraper it may
  // just be markup we failed to parse, so the next provider gets a try.
  trustEmpty: boolean;
  // Query shapes this provider can answer correctly; omitted means any.
  handles?: (query: string) => boolean;
}

/**
 * Tried in order: Tavily, Parallel, Firecrawl, Serper, Bing, DuckDuckGo. Providers
 * that need a key only join when one is set and free-tier quota is left. Parallel
 * and Firecrawl are hosted and key-free (turn them off with
 * REPSCOUT_HOSTED_SEARCH=false). Bing runs locally but cannot do site: queries.
 * DuckDuckGo is last because it is the first to get bot-checked.
 */
const CHAIN: ChainEntry[] = [
  { provider: tavilyProvider, enabled: () => Boolean(TAVILY_API_KEY) && hasQuota("tavily"), trustEmpty: true },
  { provider: parallelProvider, enabled: () => HOSTED_SEARCH_ENABLED, trustEmpty: true },
  { provider: firecrawlProvider, enabled: () => HOSTED_SEARCH_ENABLED, trustEmpty: true },
  { provider: serperProvider, enabled: () => Boolean(SERPER_API_KEY) && hasQuota("serper"), trustEmpty: true },
  // Brave asks for a card, so it is not a free-tier provider, but it stays for anyone who already has a key.
  { provider: braveProvider, enabled: () => Boolean(BRAVE_API_KEY), trustEmpty: true },
  { provider: bingProvider, enabled: () => true, trustEmpty: false, handles: bingHandles },
  { provider: duckduckgoProvider, enabled: () => true, trustEmpty: false },
];

/** Clears the circuit breaker (used by tests and by anyone who has just fixed a key). */
export function resetSearchHealth(): void {
  resetHealth();
}

function hasKeyedProvider(): boolean {
  return Boolean(TAVILY_API_KEY || BRAVE_API_KEY || SERPER_API_KEY);
}

/**
 * Runs a search through the first provider that answers. A provider that
 * errors (HTTP error, quota, bot-check) is skipped for a cooldown and the next
 * one is tried. Only when every provider has failed does this throw, and the
 * error then lists what each one said.
 */
export async function search(query: string, count = 10): Promise<{ provider: string; results: SearchResult[] }> {
  const failures: string[] = [];
  let emptyFrom: string | null = null;

  for (const { provider, enabled, trustEmpty, handles } of CHAIN) {
    if (!enabled() || (handles && !handles(query))) continue;

    const down = coolingDown(`search:${provider.name}`);
    if (down) {
      failures.push(`${provider.name}: skipped, failed recently (${down})`);
      continue;
    }

    try {
      const results = await provider.search(query, count);
      if (provider.name === "tavily") recordUsage("tavily");
      if (results.length > 0) return { provider: provider.name, results };
      if (trustEmpty) return { provider: provider.name, results };
      emptyFrom ??= provider.name;
    } catch (err) {
      const { error, reason } = describeError(err);
      markFailed(`search:${provider.name}`, reason, error);
      failures.push(`${provider.name}: ${error}`);
    }
  }

  if (emptyFrom) return { provider: emptyFrom, results: [] };

  const detail = failures.join("; ") || "no provider is available";
  // Without a key, the advice that helps is to set one; with one, classify what actually went wrong.
  const reason = hasKeyedProvider() ? classifyMessage(detail) : "no_search_key";
  throw new SourceFailure(`No search provider answered (${detail})`, reason);
}
