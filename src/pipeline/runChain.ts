import { MAX_REVIEWS_PER_SOURCE } from "../config.js";
import { getCached, setCached } from "../fetch/pageCache.js";
import { coolingDown, markFailed } from "../providers/health.js";
import { hasQuota } from "../providers/quota.js";
import { redactStructuralPII } from "../report/redact.js";
import { buildContext } from "../sources/context.js";
import { updateSourceState } from "./manifest.js";
import type { FailureReason } from "./failure.js";
import type { ProviderOutcome, ReviewProvider } from "../providers/types.js";
import type { ExtractedFinding, MatchedPage, Review, RunManifest } from "../types.js";

function formatReviews(source: string, reviews: Review[], detail?: string): string {
  const rated = reviews.filter((r) => r.rating !== undefined);
  const avg = rated.length ? rated.reduce((n, r) => n + (r.rating as number), 0) / rated.length : null;
  const header =
    `${reviews.length} ${source} review${reviews.length === 1 ? "" : "s"}` +
    (avg !== null ? `, average ${avg.toFixed(1)}/5 across the ${rated.length} rated` : "") +
    (detail ? ` (${detail})` : "") +
    ":";
  const lines = reviews.map((r) => {
    const meta = [r.rating !== undefined ? `${r.rating}/5` : null, r.date ? r.date.slice(0, 10) : null]
      .filter(Boolean)
      .join(", ");
    return `- ${meta ? `[${meta}] ` : ""}${r.title ? `${r.title}: ` : ""}${r.text}`;
  });
  return [header, ...lines].join("\n");
}

function cacheKey(source: string, provider: string, manifest: RunManifest): string {
  return ["chain", source, provider, manifest.companySlug, manifest.hints.domain ?? "", manifest.hints.location ?? ""].join("|");
}

async function cachedOutcome(key: string): Promise<ProviderOutcome | null> {
  const raw = await getCached(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as ProviderOutcome;
  } catch {
    return null;
  }
}

/**
 * Walks a source's provider chain and records the first usable result.
 * Returns false (without touching the manifest) when no provider in the chain is
 * enabled, so the caller can fall back to the original resolve-then-fetch path.
 */
export async function runChain(manifest: RunManifest, source: string, chain: ReviewProvider[]): Promise<boolean> {
  if (!chain.some((p) => p.enabled())) return false;

  const ctx = buildContext(manifest, source);
  const notes: string[] = [];
  const errors: { reason: FailureReason; message: string }[] = [];
  let sawEmpty = false;

  for (const provider of chain) {
    if (!provider.enabled()) {
      if (provider.quotaKey && !hasQuota(provider.quotaKey)) notes.push(`${provider.name}: skipped, quota exhausted`);
      continue;
    }
    const down = coolingDown(provider.name);
    if (down) {
      notes.push(`${provider.name}: skipped, failed recently`);
      errors.push({ reason: "unknown", message: `${provider.name}: ${down}` });
      continue;
    }

    const key = cacheKey(source, provider.name, manifest);
    let outcome = await cachedOutcome(key);
    const fromCache = outcome !== null;
    if (!outcome) {
      try {
        outcome = await provider.fetchReviews(ctx);
      } catch (err) {
        outcome = { kind: "error", reason: "unknown", message: err instanceof Error ? err.message : String(err) };
      }
    }

    if (outcome.kind === "error") {
      markFailed(provider.name, outcome.reason, outcome.message);
      errors.push({ reason: outcome.reason, message: outcome.message });
      notes.push(`${provider.name}: ${outcome.message}`);
      continue;
    }
    if (outcome.kind === "empty") {
      sawEmpty = true;
      notes.push(`${provider.name}: no content`);
      continue;
    }

    if (!fromCache) await setCached(key, JSON.stringify(outcome));

    let findings: ExtractedFinding[];
    let matchedPages: MatchedPage[];
    if (outcome.kind === "reviews") {
      const reviews = outcome.reviews.slice(0, MAX_REVIEWS_PER_SOURCE);
      const url = outcome.url ?? reviews.find((r) => r.url)?.url ?? "";
      findings = [{ url, text: redactStructuralPII(formatReviews(source, reviews, outcome.detail)), redacted: true }];
      matchedPages = url
        ? [{ url, confidence: "high", matchedOn: [`provider:${provider.name}`] }]
        : [];
    } else {
      findings = outcome.pages.map((p) => ({ url: p.url, text: redactStructuralPII(p.markdown), redacted: true }));
      matchedPages = outcome.matched ?? outcome.pages.map((p) => ({ url: p.url, confidence: "medium" as const, matchedOn: [] }));
    }

    const detail = [
      `via ${provider.name}${fromCache ? " (cached)" : ""}`,
      outcome.detail,
      notes.length ? `earlier: ${notes.join("; ")}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    await updateSourceState(manifest, source, { status: "done", provider: provider.name, matchedPages, findings, detail });
    return true;
  }

  const summary = notes.join("; ");
  const botBlocked = errors.find((e) => e.reason === "bot_blocked");
  if (errors.length > 0 && !sawEmpty && botBlocked) {
    await updateSourceState(manifest, source, { status: "blocked", error: summary, reason: "bot_blocked" });
  } else if (errors.length > 0 && !sawEmpty) {
    await updateSourceState(manifest, source, {
      status: "failed",
      attempts: (manifest.sources[source]?.attempts ?? 0) + 1,
      error: summary,
      reason: errors[0].reason,
    });
  } else {
    await updateSourceState(manifest, source, { status: "no_results", detail: summary || undefined });
  }
  return true;
}
