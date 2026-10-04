import { throttleHost, hostnameOf } from "./throttle.js";

export const DEFAULT_UA =
  "Mozilla/5.0 (compatible; reputation-scout/0.1; +https://www.npmjs.com/package/reputation-scout)";

const BOT_CHECK_MARKERS = [
  "captcha",
  "are you a human",
  "access denied",
  "unusual traffic",
  "verify you are a human",
  "verifying connection",
  "just a moment",
  "enable js and disable any ad blocker",
  "cc=botnet",
  "anomaly.js",
  "challenge-form",
];

export function isBotChecked(html: string): boolean {
  const lowerHtml = html.slice(0, 5000).toLowerCase();
  return BOT_CHECK_MARKERS.some((marker) => lowerHtml.includes(marker));
}

export interface RawFetchResult {
  status: number;
  html: string;
  botChecked: boolean;
}

/**
 * A throttled, plain HTTP GET with bot-check detection, shared by anything
 * that scrapes a site's own HTML directly (a search provider, or a
 * source-specific direct-URL resolver) rather than going through
 * fetchPage's readability extraction, which is tuned for article/review
 * content rather than search-result or profile-listing markup.
 */
export async function fetchRawHtml(url: string): Promise<RawFetchResult> {
  await throttleHost(hostnameOf(url));

  const res = await fetch(url, { headers: { "User-Agent": DEFAULT_UA } });
  const html = await res.text();

  return { status: res.status, html, botChecked: isBotChecked(html) };
}
