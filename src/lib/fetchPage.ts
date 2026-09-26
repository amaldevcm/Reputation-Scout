import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { throttleHost, hostnameOf } from "./throttle.js";
import { getCached, setCached } from "./pageCache.js";
import { MAX_FETCH_RETRIES } from "./config.js";

export type FetchOutcome =
  | { kind: "ok"; text: string }
  | { kind: "blocked"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "parse_error"; reason: string };

const BOT_CHECK_MARKERS = [
  "captcha",
  "are you a human",
  "access denied",
  "unusual traffic",
  "verify you are a human",
  "cloudflare",
];

async function fetchOnce(url: string): Promise<{ status: number; body: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; reputation-scout/0.1; +https://www.npmjs.com/package/reputation-scout)",
      },
    });
    const body = await res.text();
    return { status: res.status, body };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}

function extractReadableText(html: string, url: string): string | null {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article?.textContent && article.textContent.trim().length > 200) {
      return article.textContent.trim();
    }
  } catch {
    // fall through to cheerio fallback
  }

  try {
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    if (text.length > 200) return text;
  } catch {
    // ignore
  }
  return null;
}

export async function fetchPage(url: string): Promise<FetchOutcome> {
  const cached = await getCached(url);
  if (cached !== null) return { kind: "ok", text: cached };

  const hostname = hostnameOf(url);
  let lastError = "unknown error";

  for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt++) {
    await throttleHost(hostname);
    const result = await fetchOnce(url);

    if ("error" in result) {
      lastError = result.error;
      // transient network error: retry with short backoff
      if (attempt < MAX_FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return { kind: "failed", reason: lastError };
    }

    if (result.status === 403 || result.status === 429) {
      // blocked/rate-limited: not auto-retried, retrying a bot-wall wastes
      // time and looks more bot-like
      return { kind: "blocked", reason: `HTTP ${result.status}` };
    }

    const lowerBody = result.body.slice(0, 5000).toLowerCase();
    if (BOT_CHECK_MARKERS.some((marker) => lowerBody.includes(marker))) {
      return { kind: "blocked", reason: "bot-check markers detected" };
    }

    if (result.status >= 500) {
      lastError = `HTTP ${result.status}`;
      if (attempt < MAX_FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return { kind: "failed", reason: lastError };
    }

    if (result.status >= 400) {
      return { kind: "failed", reason: `HTTP ${result.status}` };
    }

    const text = extractReadableText(result.body, url);
    if (!text) {
      return { kind: "parse_error", reason: "extractor found no review-shaped content" };
    }

    await setCached(url, text);
    return { kind: "ok", text };
  }

  return { kind: "failed", reason: lastError };
}
