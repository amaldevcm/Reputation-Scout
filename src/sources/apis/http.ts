import { throttleHost, hostnameOf } from "../../fetch/throttle.js";
import { DEFAULT_UA } from "../../fetch/httpFetch.js";
import { CONTACT_EMAIL } from "../../config.js";

// SEC and similar public APIs ask for a User-Agent that identifies the caller.
const API_UA = CONTACT_EMAIL ? `${DEFAULT_UA} contact: ${CONTACT_EMAIL}` : DEFAULT_UA;

const lastCallByHost = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface JsonFetchOptions {
  headers?: Record<string, string>;
  /** Minimum gap between calls to this host, on top of the global per-host delay. */
  minGapMs?: number;
  /** Retry once after this many ms if the host answers 429. */
  retryOn429Ms?: number;
}

export async function fetchJson<T>(url: string, opts: JsonFetchOptions = {}): Promise<T> {
  const host = hostnameOf(url);

  for (let attempt = 0; attempt < 2; attempt++) {
    await throttleHost(host);
    if (opts.minGapMs) {
      const wait = (lastCallByHost.get(host) ?? 0) + opts.minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallByHost.set(host, Date.now());
    }

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": API_UA, Accept: "application/json", ...opts.headers },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err: any) {
      // Node's bare "fetch failed" hides the cause (timeout, DNS, refused).
      const cause = err?.cause?.code ?? err?.cause?.message ?? err?.name ?? "network error";
      throw new Error(`could not reach ${host} (${cause})`);
    }

    if (res.status === 429 && opts.retryOn429Ms && attempt === 0) {
      await sleep(opts.retryOn429Ms);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${host}`);

    const body = await res.text();
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error(`${host} returned a non-JSON response: ${body.slice(0, 80).replace(/\s+/g, " ")}`);
    }
  }
  throw new Error(`HTTP 429 from ${host}`);
}
