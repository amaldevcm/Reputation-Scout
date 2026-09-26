import { bbbResolver } from "./bbb.js";
import { sitejabberResolver } from "./sitejabber.js";
import type { Resolver } from "./types.js";

export type { Resolver };

/**
 * Sources with a resolver skip the generic web-search step (Brave/
 * DuckDuckGo) entirely, going straight to a source-constructed URL. Sources
 * without one fall through to the existing search-based flow unchanged.
 *
 * Other candidates were checked and ruled out for now (see the project plan
 * doc's "Core architecture decisions" — Trustpilot, G2, Clutch, Capterra,
 * Crunchbase, and Indeed's search page all return bot-check/WAF pages to a
 * plain fetch; Reddit's public search.json now 403s for anonymous requests).
 * They'd need a headless browser or an authenticated API, both explicitly
 * deferred elsewhere in this project.
 */
export const RESOLVERS: Record<string, Resolver> = {
  bbb: bbbResolver,
  sitejabber: sitejabberResolver,
};
