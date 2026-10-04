import type { DisambiguationHints, ExtractedFinding, MatchedPage } from "../types.js";

/**
 * A data source talks to a structured API (or a search snippet feed) and
 * returns finished finding text directly, instead of producing URLs for
 * fetchPage to scrape. Used for public-record and API-backed sources where
 * there is no page to extract readable text from.
 *
 * Throwing means the source failed (network error, HTTP error, unexpected
 * response shape) and is recorded as such; the three result kinds below are
 * the expected, non-error outcomes.
 */
export type DataSourceResult =
  | { kind: "ok"; pages: MatchedPage[]; findings: ExtractedFinding[]; detail?: string }
  // The API was reached and has nothing under this name.
  | { kind: "no_results" }
  // The source can't apply to this company at all (e.g. SEC filings for a
  // company with no public listing) — distinct from "looked and found nothing".
  | { kind: "not_applicable"; reason: string };

export type DataSource = (
  companyName: string,
  hints: DisambiguationHints
) => Promise<DataSourceResult>;
