import { normalizeDomain } from "../../util/domain.js";
import type { MatchedPage } from "../../types.js";
import type { Resolver } from "./types.js";

/**
 * SiteJabber pages are keyed by domain (sitejabber.com/reviews/<domain>) and
 * are reliably fetchable without a headless browser — no bot-check wall, and
 * a clean 404 (surfaced downstream as fetchPage's "not_found" outcome) when
 * the domain has no SiteJabber presence. Only applies when a domain hint is
 * given: there's no site-search fallback here, just the canonical guess.
 */
export const sitejabberResolver: Resolver = async (_companyName, hints) => {
  if (!hints.domain) return null;

  const domain = normalizeDomain(hints.domain);
  const match: MatchedPage = {
    url: `https://www.sitejabber.com/reviews/${domain}`,
    title: `SiteJabber: ${domain}`,
    confidence: "high",
    matchedOn: [`domain:${hints.domain}`],
  };

  return [match];
};
