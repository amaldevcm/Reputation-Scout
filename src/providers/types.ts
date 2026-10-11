import type { DisambiguationHints, MatchedPage, Review } from "../types.js";
import type { FailureReason } from "../pipeline/failure.js";
import type { SearchResult } from "../search/types.js";

export interface PageContent {
  url: string;
  markdown: string;
}

export type ProviderOutcome =
  // Structured reviews (Apify, SerpApi, Yelp).
  | { kind: "reviews"; reviews: Review[]; url?: string; detail?: string }
  // Raw page content (direct, Jina, Firecrawl, Bright Data, search previews).
  | { kind: "pages"; pages: PageContent[]; matched?: MatchedPage[]; detail?: string }
  | { kind: "empty" }
  | { kind: "error"; reason: FailureReason; message: string };

export interface SourceContext {
  source: string;
  companyName: string;
  hints: DisambiguationHints;
  /** Candidate pages for the source: its direct-URL resolver, else search results. Memoized. */
  pages(): Promise<MatchedPage[]>;
  /** The shared search for this source's query. Memoized. */
  search(): Promise<{ provider: string; results: SearchResult[] }>;
}

export interface ReviewProvider {
  name: string;
  enabled(): boolean;
  /** Key into the quota tracker; lets a skipped provider be reported as quota-exhausted. */
  quotaKey?: string;
  fetchReviews(ctx: SourceContext): Promise<ProviderOutcome>;
}
