import { TAVILY_API_KEY } from "../config.js";
import type { SearchProvider, SearchResult } from "./types.js";

export const tavilyProvider: SearchProvider = {
  name: "tavily",
  async search(query: string, count = 10): Promise<SearchResult[]> {
    if (!TAVILY_API_KEY) {
      throw new Error("TAVILY_API_KEY is not set.");
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        max_results: count,
        search_depth: "basic",
      }),
    });

    if (!res.ok) {
      throw new Error(`Tavily search error: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const results = data?.results ?? [];
    return results.map((r: any) => ({
      url: r.url,
      title: r.title ?? "",
      snippet: r.content ?? "",
    }));
  },
};
