import { BRAVE_API_KEY } from "../config.js";
import { braveProvider } from "./braveProvider.js";
import { duckduckgoProvider } from "./duckduckgoProvider.js";
import type { SearchProvider, SearchResult } from "./types.js";

export type { SearchProvider, SearchResult };

function selectProvider(): SearchProvider {
  return BRAVE_API_KEY ? braveProvider : duckduckgoProvider;
}

/**
 * Runs a search through Brave (when BRAVE_API_KEY is set) or falls back to
 * the key-free DuckDuckGo scraper. A missing key means reduced-confidence
 * coverage, not a hard failure — consistent with this project's
 * graceful-partial-failure design elsewhere.
 */
export async function search(query: string, count = 10): Promise<{ provider: string; results: SearchResult[] }> {
  const provider = selectProvider();
  const results = await provider.search(query, count);
  return { provider: provider.name, results };
}
