import { normalizeDomain } from "../domain.js";
import type { MatchedPage } from "../types.js";
import type { Resolver } from "./types.js";

/**
 * Trustpilot profiles are keyed by domain (trustpilot.com/review/<domain>).
 * A plain fetch gets bot-walled, but fetchPage retries through the Jina
 * Reader fallback, which does return the page. Like SiteJabber, it only
 * applies when a domain hint is given; without one the caller falls back to
 * generic search.
 */
export const trustpilotResolver: Resolver = async (_companyName, hints) => {
  if (!hints.domain) return null;

  const domain = normalizeDomain(hints.domain);
  const match: MatchedPage = {
    url: `https://www.trustpilot.com/review/${domain}`,
    title: `Trustpilot: ${domain}`,
    confidence: "high",
    matchedOn: [`domain:${hints.domain}`],
  };
  return [match];
};
