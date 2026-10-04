import { throttleHost } from "./throttle.js";
import { DEFAULT_UA } from "./httpFetch.js";
import { JINA_API_KEY } from "../config.js";

const JINA_HOST = "r.jina.ai";
const MIN_TEXT_LENGTH = 200;
const JINA_RETRY_MS = 4_000;

// Jina returns HTTP 200 with the target's error page as the content, so a
// missing profile has to be recognized from the page itself.
const NOT_FOUND_RE =
  /could not be found|couldn't be found|page not found|\b404\b[^a-z0-9]{0,3}(?:not found|error)|!\[Image \d+: 404\]/i;

export type JinaOutcome = { kind: "ok"; text: string } | { kind: "not_found" };

/**
 * Fallback for pages a plain fetch gets bot-walled on. Jina Reader fetches the
 * page server-side and returns markdown. It returns HTTP 200 even when the
 * target served it a CAPTCHA (an empty body plus a warning line) or a 404 page,
 * so the outcome is judged on the content, not the status code.
 *
 * Returns null if Jina couldn't get usable content (still blocked or empty).
 */
export async function fetchViaJina(url: string): Promise<JinaOutcome | null> {
  await throttleHost(JINA_HOST);

  const headers: Record<string, string> = {
    "User-Agent": DEFAULT_UA,
    Accept: "text/plain",
  };
  if (JINA_API_KEY) headers.Authorization = `Bearer ${JINA_API_KEY}`;

  try {
    let res = await fetch(`https://${JINA_HOST}/${url}`, { headers });
    if (res.status === 429) {
      // Jina's keyless tier is rate limited; one pause-and-retry covers a burst of parallel sources.
      await new Promise((r) => setTimeout(r, JINA_RETRY_MS));
      await throttleHost(JINA_HOST);
      res = await fetch(`https://${JINA_HOST}/${url}`, { headers });
    }
    if (!res.ok) return null;

    const body = await res.text();
    // Only the header block (before the content) carries Jina's warnings;
    // scanning the whole body would flag reviews that merely mention "captcha".
    const contentStart = body.indexOf("Markdown Content:");
    const header = contentStart === -1 ? body.slice(0, 1000) : body.slice(0, contentStart);
    if (/returned error 404/i.test(header)) return { kind: "not_found" };
    if (/captcha|access denied|just a moment/i.test(header)) return null;

    const text = contentStart === -1 ? body : body.slice(contentStart + "Markdown Content:".length);
    const trimmed = text.trim();
    if (trimmed.length < MIN_TEXT_LENGTH) return null;
    if (NOT_FOUND_RE.test(trimmed.slice(0, 3000))) return { kind: "not_found" };

    // The page title often carries the headline rating ("... rated "Bad" with
    // 1.6 / 5 on Trustpilot"), which the body alone doesn't repeat.
    const title = header.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
    return { kind: "ok", text: title ? `${title}\n\n${trimmed}` : trimmed };
  } catch {
    return null;
  }
}
