import type { DisambiguationHints, MatchedPage } from "../types.js";

/**
 * A source-specific resolver constructs candidate URLs directly (a
 * predictable per-site search page, or a domain-keyed canonical profile
 * URL) instead of going through the generic web-search layer
 * (Brave/DuckDuckGo). This is what "direct-URL construction" means here:
 * skipping the fragile external-search step entirely for sources where the
 * source's own site is reliably fetchable.
 *
 * Returns:
 * - `null`  — no resolver applies for these inputs (e.g. a domain-keyed
 *   resolver with no domain hint provided) — caller should fall back to
 *   generic search.
 * - `[]`    — the resolver ran (e.g. hit the source's own search page) and
 *   found no candidates — caller should treat this as no_results and NOT
 *   fall back to generic search for this source.
 * - `MatchedPage[]` — one or more candidate pages to fetch and extract.
 */
export type Resolver = (
  companyName: string,
  hints: DisambiguationHints
) => Promise<MatchedPage[] | null>;
