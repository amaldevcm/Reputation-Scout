import type { FailureReason } from "./failure.js";

export type SourceStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "no_results"
  // The source can't apply to this company at all (e.g. SEC filings for a
  // private company), as opposed to "looked and found nothing".
  | "not_applicable"
  | "blocked"
  | "failed"
  | "parse_error";

export type Confidence = "high" | "medium" | "low";

export interface DisambiguationHints {
  domain?: string;
  location?: string;
  industry_hint?: string;
}

export interface MatchedPage {
  url: string;
  title?: string;
  confidence: Confidence;
  matchedOn: string[];
}

export interface ExtractedFinding {
  url: string;
  text: string;
  redacted: boolean;
}

export interface SourceRunState {
  source: string;
  status: SourceStatus;
  attempts: number;
  matchedPages: MatchedPage[];
  findings: ExtractedFinding[];
  error?: string;
  // Actionable category for a failed or blocked source (see failure.ts).
  reason?: FailureReason;
  // Short human-readable note for the report's Sources table (why a source
  // was not applicable, or what a data source found).
  detail?: string;
  updatedAt: string;
}

export interface RunManifest {
  companyName: string;
  companySlug: string;
  hints: DisambiguationHints;
  createdAt: string;
  updatedAt: string;
  sources: Record<string, SourceRunState>;
}

export const DEFAULT_SOURCES = [
  "glassdoor",
  "indeed",
  "clutch",
  "g2",
  "bbb",
  "reddit",
  "linkedin",
  "google_reviews",
  "sitejabber",
  "trustpilot",
  // Free public-record and API-backed sources (see lib/dataSources).
  "cfpb",
  "sec_edgar",
  "courtlistener",
  "hacker_news",
  "news",
  "app_store",
] as const;
