import { normalizeDomain } from "../util/domain.js";
import { DATA_SOURCES } from "../sources/apis/index.js";
import { REMEDIES, type FailureReason } from "./failure.js";
import type { RunManifest, SourceRunState, SourceStatus } from "../types.js";

const enc = encodeURIComponent;

/**
 * Where a person can look a company up by hand, per source. Built from fixed
 * URL templates, so it works even when every automatic route failed. Sites
 * without a search URL we can rely on use a Google site: search instead.
 */
const LOOKUP: Record<string, (name: string, domain?: string) => string> = {
  glassdoor: (n) => `https://www.glassdoor.com/Search/results.htm?keyword=${enc(n)}`,
  indeed: (n) => `https://www.indeed.com/companies/search?q=${enc(n)}`,
  clutch: (n) => `https://www.google.com/search?q=${enc(`${n} reviews site:clutch.co`)}`,
  g2: (n) => `https://www.g2.com/search?query=${enc(n)}`,
  bbb: (n) => `https://www.bbb.org/search?find_text=${enc(n)}`,
  reddit: (n) => `https://www.reddit.com/search/?q=${enc(`"${n}"`)}`,
  linkedin: (n) => `https://www.linkedin.com/search/results/companies/?keywords=${enc(n)}`,
  google_reviews: (n) => `https://www.google.com/search?q=${enc(`${n} reviews`)}`,
  sitejabber: (n, d) => (d ? `https://www.sitejabber.com/reviews/${d}` : `https://www.sitejabber.com/search?q=${enc(n)}`),
  trustpilot: (n, d) => (d ? `https://www.trustpilot.com/review/${d}` : `https://www.trustpilot.com/search?query=${enc(n)}`),
  cfpb: (n) => `https://www.consumerfinance.gov/data-research/consumer-complaints/search/?searchField=company&searchText=${enc(n)}`,
  sec_edgar: (n) => `https://www.sec.gov/edgar/search/#/q=${enc(`"${n}"`)}`,
  courtlistener: (n) => `https://www.courtlistener.com/?q=${enc(`caseName:"${n}"`)}&type=r`,
  hacker_news: (n) => `https://hn.algolia.com/?q=${enc(n)}&type=story`,
  news: (n) => `https://news.google.com/search?q=${enc(`"${n}"`)}`,
  app_store: (n) => `https://www.google.com/search?q=${enc(`${n} site:apps.apple.com`)}`,
};

export function lookupUrl(source: string, companyName: string, domainHint?: string): string {
  const domain = domainHint ? normalizeDomain(domainHint) : undefined;
  const build = LOOKUP[source];
  return build ? build(companyName, domain) : `https://www.google.com/search?q=${enc(`${companyName} ${source} reviews`)}`;
}

const REASON_LABELS: Record<FailureReason, string> = {
  no_search_key: "Search unavailable",
  rate_limited: "Rate limited",
  bot_blocked: "Blocked by the site",
  service_down: "Service unreachable",
  unknown: "Failed",
};

const UNRESOLVED_STATUSES: ReadonlySet<SourceStatus> = new Set([
  "failed",
  "blocked",
  "parse_error",
  "pending",
  "in_progress",
  "no_results",
]);

export interface UnresolvedSource {
  source: string;
  status: SourceStatus;
  reason?: FailureReason;
  why: string;
  remedy: string;
  lookupUrl: string;
}

/**
 * An empty answer from a public-record API (CFPB, SEC, courts, ...) is a real
 * answer. An empty answer from a search-backed source may just be a miss.
 */
function isAuthoritative(source: string): boolean {
  return source in DATA_SOURCES && source !== "reddit";
}

function reasonOf(s: SourceRunState): FailureReason | undefined {
  return s.reason ?? (s.status === "blocked" ? "bot_blocked" : undefined);
}

function describe(s: SourceRunState): { why: string; remedy: string } {
  const reason = reasonOf(s);
  if (reason) return { why: REASON_LABELS[reason], remedy: REMEDIES[reason] };
  if (s.status === "no_results") {
    return { why: "Nothing found automatically", remedy: "The lookup link may find something the search missed." };
  }
  if (s.status === "parse_error") {
    return { why: "Page had no readable content", remedy: "Use the lookup link to read it by hand." };
  }
  return { why: "Not finished", remedy: "Call resume_research to finish it." };
}

/** Sources that didn't give the user an answer, each with a reason, a remedy and a link to check by hand. */
export function unresolvedSources(manifest: RunManifest): UnresolvedSource[] {
  return Object.values(manifest.sources)
    .filter((s) => UNRESOLVED_STATUSES.has(s.status) && !(s.status === "no_results" && isAuthoritative(s.source)))
    .map((s) => ({
      source: s.source,
      status: s.status,
      reason: reasonOf(s),
      ...describe(s),
      lookupUrl: lookupUrl(s.source, manifest.companyName, manifest.hints.domain),
    }));
}

/** One line per failure reason, naming the affected sources and the fix. */
export function runHealthLines(unresolved: UnresolvedSource[]): string[] {
  const byReason = new Map<FailureReason, string[]>();
  for (const u of unresolved) {
    if (!u.reason) continue;
    byReason.set(u.reason, [...(byReason.get(u.reason) ?? []), u.source]);
  }
  return [...byReason].map(([reason, sources]) => `- **${REASON_LABELS[reason]}** (${sources.join(", ")}): ${REMEDIES[reason]}`);
}

/** Fields a tool result spreads in so the calling agent sees what is left and how to finish it. */
export function unresolvedResult(manifest: RunManifest) {
  const unresolved = unresolvedSources(manifest);
  if (unresolved.length === 0) return {};
  return {
    unresolved: unresolved.map(({ source, status, why, remedy, lookupUrl }) => ({
      source,
      status,
      why,
      remedy,
      lookup_url: lookupUrl,
    })),
    next_steps:
      "Unresolved sources include a lookup_url you can open or browse with your own tools. To retry the automatic route, fix the cause in `remedy` and call resume_research.",
  };
}
