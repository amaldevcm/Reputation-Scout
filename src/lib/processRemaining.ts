import { search } from "./search/index.js";
import { buildQuery } from "./searchQuery.js";
import { fetchPage } from "./fetchPage.js";
import { scoreMatch } from "./disambiguate.js";
import { redactStructuralPII } from "./redact.js";
import { updateSourceState } from "./manifest.js";
import { RESOLVERS } from "./resolvers/index.js";
import type { ExtractedFinding, MatchedPage, RunManifest } from "./types.js";

/**
 * Resolves candidate pages for a source either via its direct-URL resolver
 * (skipping the external search step entirely) or, when no resolver applies,
 * via the generic search provider — same as before this was added.
 */
async function resolveMatchedPages(
  manifest: RunManifest,
  source: string
): Promise<{ matchedPages: MatchedPage[] } | { noResults: true } | { error: string }> {
  const resolver = RESOLVERS[source];
  if (resolver) {
    try {
      const resolved = await resolver(manifest.companyName, manifest.hints);
      if (resolved !== null) {
        return resolved.length === 0 ? { noResults: true } : { matchedPages: resolved };
      }
      // resolver declined (e.g. no domain hint) — fall through to search
    } catch (err: any) {
      return { error: err?.message ?? String(err) };
    }
  }

  const query = buildQuery(manifest.companyName, source, manifest.hints);
  try {
    const { results } = await search(query);
    if (results.length === 0) return { noResults: true };
    const matchedPages = results.slice(0, 3).map((r) => {
      const { confidence, matchedOn } = scoreMatch(manifest.companyName, manifest.hints, r);
      return { url: r.url, title: r.title, confidence, matchedOn };
    });
    return { matchedPages };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}

async function processSource(manifest: RunManifest, source: string): Promise<void> {
  await updateSourceState(manifest, source, { status: "in_progress" });

  const resolution = await resolveMatchedPages(manifest, source);

  if ("error" in resolution) {
    await updateSourceState(manifest, source, {
      status: "failed",
      attempts: (manifest.sources[source]?.attempts ?? 0) + 1,
      error: resolution.error,
    });
    return;
  }

  if ("noResults" in resolution) {
    await updateSourceState(manifest, source, { status: "no_results" });
    return;
  }

  const { matchedPages } = resolution;
  const findings: ExtractedFinding[] = [];
  let sawBlocked = false;
  let sawParseError = false;
  let sawFailed = false;
  let sawNotFound = false;
  let lastError = "";

  for (const page of matchedPages) {
    const outcome = await fetchPage(page.url);
    if (outcome.kind === "ok") {
      findings.push({ url: page.url, text: redactStructuralPII(outcome.text), redacted: true });
    } else if (outcome.kind === "blocked") {
      sawBlocked = true;
      lastError = outcome.reason;
    } else if (outcome.kind === "parse_error") {
      sawParseError = true;
      lastError = outcome.reason;
    } else if (outcome.kind === "not_found") {
      sawNotFound = true;
    } else {
      sawFailed = true;
      lastError = outcome.reason;
    }
  }

  if (findings.length > 0) {
    await updateSourceState(manifest, source, { status: "done", matchedPages, findings });
  } else if (sawBlocked) {
    await updateSourceState(manifest, source, { status: "blocked", matchedPages, error: lastError });
  } else if (sawParseError) {
    await updateSourceState(manifest, source, { status: "parse_error", matchedPages, error: lastError });
  } else if (sawFailed) {
    await updateSourceState(manifest, source, {
      status: "failed",
      matchedPages,
      attempts: (manifest.sources[source]?.attempts ?? 0) + 1,
      error: lastError,
    });
  } else if (sawNotFound) {
    // Every candidate was a clean 404 (a direct-URL guess with no presence
    // at that address) — the company just isn't on this source, not a
    // failure to reach it.
    await updateSourceState(manifest, source, { status: "no_results", matchedPages });
  } else {
    await updateSourceState(manifest, source, {
      status: "failed",
      matchedPages,
      attempts: (manifest.sources[source]?.attempts ?? 0) + 1,
      error: lastError || "unknown error",
    });
  }
}

/**
 * Per-run fan-out across sources is fully parallel by design — 8 concurrent
 * requests to 8 different hosts isn't aggressive to any single site. The
 * real throttling (per-host, per-search-provider) is enforced globally
 * inside search()/fetchPage/resolvers, so this stays safe even across
 * overlapping runs.
 */
export async function processRemainingSources(manifest: RunManifest, sources: string[]): Promise<void> {
  await Promise.all(sources.map((source) => processSource(manifest, source)));
}
