import { search } from "../search/index.js";
import { buildQuery } from "../pipeline/searchQuery.js";
import { scoreMatch } from "../pipeline/disambiguate.js";
import { describeError, SourceFailure, type FailureReason } from "../pipeline/failure.js";
import { RESOLVERS } from "./resolvers/index.js";
import type { MatchedPage, RunManifest } from "../types.js";
import type { SourceContext } from "../providers/types.js";

export type Resolution =
  // `provider` is the search engine that found the pages; absent for direct-URL resolvers.
  | { matchedPages: MatchedPage[]; provider?: string }
  | { noResults: true }
  | { error: string; reason: FailureReason };

/**
 * Resolves candidate pages for a source either via its direct-URL resolver
 * (skipping the external search step entirely) or, when no resolver applies,
 * via the generic search provider chain.
 */
export async function resolveMatchedPages(manifest: RunManifest, source: string): Promise<Resolution> {
  const resolver = RESOLVERS[source];
  if (resolver) {
    try {
      const resolved = await resolver(manifest.companyName, manifest.hints);
      if (resolved !== null) {
        return resolved.length === 0 ? { noResults: true } : { matchedPages: resolved };
      }
      // resolver declined (e.g. no domain hint) — fall through to search
    } catch (err) {
      return describeError(err);
    }
  }

  const query = buildQuery(manifest.companyName, source, manifest.hints);
  try {
    const { provider, results } = await search(query);
    if (results.length === 0) return { noResults: true };
    const matchedPages = results.slice(0, 3).map((r) => {
      const { confidence, matchedOn } = scoreMatch(manifest.companyName, manifest.hints, r);
      return { url: r.url, title: r.title, confidence, matchedOn };
    });
    return { matchedPages, provider };
  } catch (err) {
    return describeError(err);
  }
}

/** Lazily resolves (and memoizes) a source's candidate pages and search results for its provider chain. */
export function buildContext(manifest: RunManifest, source: string): SourceContext {
  let pages: Promise<MatchedPage[]> | null = null;
  let searched: ReturnType<SourceContext["search"]> | null = null;

  return {
    source,
    companyName: manifest.companyName,
    hints: manifest.hints,
    pages() {
      pages ??= resolveMatchedPages(manifest, source).then((r) => {
        if ("error" in r) throw new SourceFailure(r.error, r.reason);
        return "matchedPages" in r ? r.matchedPages : [];
      });
      return pages;
    },
    search() {
      searched ??= search(buildQuery(manifest.companyName, source, manifest.hints));
      return searched;
    },
  };
}
