import { throttleBrave } from "../fetch/throttle.js";
import { BRAVE_API_KEY } from "../config.js";
import type { SearchProvider, SearchResult } from "./types.js";

export const braveProvider: SearchProvider = {
  name: "brave",
  async search(query: string, count = 10): Promise<SearchResult[]> {
    if (!BRAVE_API_KEY) {
      throw new Error("BRAVE_API_KEY is not set.");
    }

    await throttleBrave();

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
    });

    if (!res.ok) {
      throw new Error(`Brave Search API error: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const results = data?.web?.results ?? [];
    return results.map((r: any) => ({
      url: r.url,
      title: r.title ?? "",
      snippet: r.description ?? "",
    }));
  },
};
