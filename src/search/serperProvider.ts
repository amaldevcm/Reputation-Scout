import { SERPER_API_KEY } from "../config.js";
import { recordUsage } from "../providers/quota.js";
import type { SearchProvider, SearchResult } from "./types.js";

export const serperProvider: SearchProvider = {
  name: "serper",
  async search(query: string, count = 10): Promise<SearchResult[]> {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": SERPER_API_KEY },
      body: JSON.stringify({ q: query, num: count }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Serper search error: HTTP ${res.status}`);
    recordUsage("serper");
    const data = (await res.json()) as any;
    return (data.organic ?? []).slice(0, count).map((r: any) => ({
      url: r.link,
      title: r.title ?? "",
      snippet: r.snippet ?? "",
    }));
  },
};
