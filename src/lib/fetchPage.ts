import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { throttleHost, hostnameOf } from "./throttle.js";
import { getCached, setCached } from "./pageCache.js";
import { MAX_FETCH_RETRIES, JINA_FALLBACK_ENABLED } from "./config.js";
import { DEFAULT_UA, isBotChecked } from "./httpFetch.js";
import { fetchViaJina } from "./jinaReader.js";

export type FetchOutcome =
  // `via: "jina"` marks text fetched through the Jina Reader fallback after
  // the direct fetch was blocked.
  | { kind: "ok"; text: string; via?: "jina" }
  | { kind: "blocked"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "parse_error"; reason: string }
  // A clean 404 on a directly-guessed/direct-resolved URL: the company has
  // no presence at that address, distinct from a transient or blocking
  // failure — callers resolving direct URLs (rather than search results)
  // should treat this as "no results", not "failed".
  | { kind: "not_found" };

async function fetchOnce(url: string): Promise<{ status: number; body: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": DEFAULT_UA },
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

async function tryJina(url: string): Promise<FetchOutcome | null> {
  if (!JINA_FALLBACK_ENABLED) return null;
  const outcome = await fetchViaJina(url);
  if (!outcome) return null;
  if (outcome.kind === "not_found") return { kind: "not_found" };
  await setCached(url, outcome.text);
  return { kind: "ok", text: outcome.text, via: "jina" };
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
      return (await tryJina(url)) ?? { kind: "blocked", reason: `HTTP ${result.status}` };
    }

    if (isBotChecked(result.body)) {
      return (await tryJina(url)) ?? { kind: "blocked", reason: "bot-check markers detected" };
    }

    if (result.status >= 500) {
      lastError = `HTTP ${result.status}`;
      if (attempt < MAX_FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return { kind: "failed", reason: lastError };
    }

    if (result.status === 404) {
      return { kind: "not_found" };
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
