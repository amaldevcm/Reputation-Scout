export type SourceStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "no_results"
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
] as const;

export type DefaultSource = (typeof DEFAULT_SOURCES)[number];
