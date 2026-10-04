/**
 * Why a source didn't produce findings, in terms a user can act on. Raw error
 * strings stay in the manifest for debugging; the reason picks the remedy
 * shown in the report and in the tool results.
 */
export type FailureReason = "no_search_key" | "rate_limited" | "bot_blocked" | "service_down" | "unknown";

export const REMEDIES: Record<FailureReason, string> = {
  no_search_key:
    "Set TAVILY_API_KEY (free tier, no credit card) or BRAVE_API_KEY, then call resume_research.",
  rate_limited: "The service asked us to slow down. Call resume_research in a few minutes.",
  bot_blocked: "The site blocks automated access. Use the lookup link to check it by hand.",
  service_down: "The service could not be reached. Call resume_research later.",
  unknown: "See the error in the Sources table, or use the lookup link.",
};

/** An error that already knows its reason, so it doesn't have to be guessed from the message. */
export class SourceFailure extends Error {
  constructor(
    message: string,
    readonly reason: FailureReason
  ) {
    super(message);
  }
}

export function classifyMessage(message: string): FailureReason {
  if (/\b429\b|rate.?limit|too many requests/i.test(message)) return "rate_limited";
  if (/\b401\b|unauthori[sz]ed|invalid api key/i.test(message)) return "no_search_key";
  if (/bot-check|captcha|anomaly|\b403\b|blocked/i.test(message)) return "bot_blocked";
  if (/could not reach|timeout|timed out|ECONN|ENOTFOUND|fetch failed|\b5\d\d\b/i.test(message)) return "service_down";
  return "unknown";
}

export function describeError(err: unknown): { error: string; reason: FailureReason } {
  const error = err instanceof Error ? err.message : String(err);
  return { error, reason: err instanceof SourceFailure ? err.reason : classifyMessage(error) };
}
