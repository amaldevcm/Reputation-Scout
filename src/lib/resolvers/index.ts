import { bbbResolver } from "./bbb.js";
import { sitejabberResolver } from "./sitejabber.js";
import { trustpilotResolver } from "./trustpilot.js";
import type { Resolver } from "./types.js";

export type { Resolver };

/**
 * Sources with a resolver skip the generic web-search step (Brave/
 * DuckDuckGo) entirely, going straight to a source-constructed URL. Sources
 * without one fall through to the existing search-based flow unchanged.
 *
 * Other candidates were checked and ruled out for now (see the project plan
 * doc's "Core architecture decisions" — G2, Clutch, Capterra, Crunchbase,
 * and Indeed's search page all return bot-check/WAF pages to a plain fetch,
 * and G2 still does through the Jina Reader fallback; Reddit is handled as a
 * data source in ../dataSources instead). They'd need a headless browser or
 * an authenticated API, both explicitly deferred elsewhere in this project.
 * Trustpilot is also bot-walled to a plain fetch, but fetchPage's Jina Reader
 * fallback gets through.
 */
export const RESOLVERS: Record<string, Resolver> = {
  bbb: bbbResolver,
  sitejabber: sitejabberResolver,
  trustpilot: trustpilotResolver,
};
