import { PER_HOST_DELAY_MS, BRAVE_RPS } from "./config.js";

/**
 * Global, process-wide limiters. Two real constraints, per the project plan:
 * a per-hostname politeness delay (shared by fetch_page and search_reviews),
 * and a separate limiter for the Brave Search API's shared quota. Both are
 * global rather than per-run, so sequential multi-company usage is throttled
 * for free.
 */

const lastRequestByHost = new Map<string, number>();
const hostQueues = new Map<string, Promise<void>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function throttleHost(hostname: string): Promise<void> {
  const prior = hostQueues.get(hostname) ?? Promise.resolve();
  const next = prior.then(async () => {
    const last = lastRequestByHost.get(hostname) ?? 0;
    const wait = last + PER_HOST_DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestByHost.set(hostname, Date.now());
  });
  hostQueues.set(hostname, next);
  return next;
}

let braveQueue: Promise<void> = Promise.resolve();
let lastBraveRequest = 0;

export async function throttleBrave(): Promise<void> {
  const minIntervalMs = 1000 / Math.max(BRAVE_RPS, 0.1);
  const next = braveQueue.then(async () => {
    const wait = lastBraveRequest + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastBraveRequest = Date.now();
  });
  braveQueue = next;
  return next;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
