import { throttleHost, hostnameOf } from "../fetch/throttle.js";
import { DEFAULT_UA } from "../fetch/httpFetch.js";
import type { SearchProvider, SearchResult } from "./types.js";

/**
 * Parallel's hosted Search MCP, used anonymously (no key, no account) as a
 * plain JSON-RPC call. Its limits are IP-based and unpublished, and the query
 * is sent to Parallel. Results come with long page excerpts, which makes it
 * the best source of previews for pages we can't fetch ourselves.
 */

const ENDPOINT = "https://search.parallel.ai/mcp";
const SNIPPET_CHARS = 300;
const EXCERPT_CHARS = 4000;

interface ParallelResult {
  url: string;
  title?: string;
  excerpts?: string[];
}

/** The server answers with plain JSON or a single server-sent-event frame; accept both. */
function parseBody(body: string): any {
  const dataLines = body.split("\n").filter((l) => l.startsWith("data:"));
  return JSON.parse(dataLines.length > 0 ? dataLines[dataLines.length - 1].slice(5) : body);
}

export const parallelProvider: SearchProvider = {
  name: "parallel",
  async search(query: string, count = 10): Promise<SearchResult[]> {
    await throttleHost(hostnameOf(ENDPOINT));

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "User-Agent": DEFAULT_UA,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "web_search",
          arguments: { objective: `Web pages matching: ${query}`, search_queries: [query] },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Parallel search error: HTTP ${res.status}`);

    const message = parseBody(await res.text());
    const result = message.result;
    if (!result || result.isError) {
      throw new Error(`Parallel search error: ${message.error?.message ?? "tool call failed"}`);
    }

    const payload = JSON.parse(result.content?.[0]?.text ?? "{}") as { results?: ParallelResult[] };
    return (payload.results ?? []).slice(0, count).map((r) => {
      const excerpt = (r.excerpts ?? []).join("\n").trim();
      return {
        url: r.url,
        title: r.title ?? "",
        snippet: excerpt.replace(/\s+/g, " ").slice(0, SNIPPET_CHARS),
        excerpt: excerpt.slice(0, EXCERPT_CHARS) || undefined,
      };
    });
  },
};
