import { TAVILY_API_KEY, BRAVE_API_KEY } from "../config.js";
import { tavilyProvider } from "./tavilyProvider.js";
import { braveProvider } from "./braveProvider.js";
import { duckduckgoProvider } from "./duckduckgoProvider.js";
import type { SearchProvider, SearchResult } from "./types.js";

export type { SearchProvider, SearchResult };

function selectProvider(): SearchProvider {
  // Tavily first: a free tier (1,000 credits/month) with no credit card
  // required, unlike Brave, which started requiring one for its credits in
  // February 2026. Brave stays supported for anyone who already has a key.
  // DuckDuckGo remains the key-free fallback when neither is configured.
  if (TAVILY_API_KEY) return tavilyProvider;
  if (BRAVE_API_KEY) return braveProvider;
  return duckduckgoProvider;
}

/**
 * Runs a search through Tavily or Brave (whichever key is set, Tavily
 * preferred) or falls back to the key-free DuckDuckGo scraper. A missing key
 * means reduced-confidence coverage, not a hard failure — consistent with
 * this project's graceful-partial-failure design elsewhere.
 */
export async function search(query: string, count = 10): Promise<{ provider: string; results: SearchResult[] }> {
  const provider = selectProvider();
  const results = await provider.search(query, count);
  return { provider: provider.name, results };
}
