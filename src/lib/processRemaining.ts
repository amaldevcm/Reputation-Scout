import { search } from "./search/index.js";
import { buildQuery } from "./searchQuery.js";
import { fetchPage } from "./fetchPage.js";
import { scoreMatch } from "./disambiguate.js";
import { redactStructuralPII } from "./redact.js";
import { updateSourceState } from "./manifest.js";
import type { ExtractedFinding, MatchedPage, RunManifest } from "./types.js";

async function processSource(manifest: RunManifest, source: string): Promise<void> {
  await updateSourceState(manifest, source, { status: "in_progress" });

  const query = buildQuery(manifest.companyName, source, manifest.hints);
  let searchResults;
  try {
    ({ results: searchResults } = await search(query));
  } catch (err: any) {
    await updateSourceState(manifest, source, {
      status: "failed",
      attempts: (manifest.sources[source]?.attempts ?? 0) + 1,
      error: err?.message ?? String(err),
    });
    return;
  }

  if (searchResults.length === 0) {
    await updateSourceState(manifest, source, { status: "no_results" });
    return;
  }

  const matchedPages: MatchedPage[] = searchResults.slice(0, 3).map((r) => {
    const { confidence, matchedOn } = scoreMatch(manifest.companyName, manifest.hints, r);
    return { url: r.url, title: r.title, confidence, matchedOn };
  });

  const findings: ExtractedFinding[] = [];
  let sawBlocked = false;
  let sawParseError = false;
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
    } else {
      lastError = outcome.reason;
    }
  }

  if (findings.length > 0) {
    await updateSourceState(manifest, source, { status: "done", matchedPages, findings });
  } else if (sawBlocked) {
    await updateSourceState(manifest, source, { status: "blocked", matchedPages, error: lastError });
  } else if (sawParseError) {
    await updateSourceState(manifest, source, { status: "parse_error", matchedPages, error: lastError });
  } else {
    await updateSourceState(manifest, source, {
      status: "failed",
      matchedPages,
      attempts: (manifest.sources[source]?.attempts ?? 0) + 1,
      error: lastError,
    });
  }
}

/**
 * Per-run fan-out across sources is fully parallel by design — 8 concurrent
 * requests to 8 different hosts isn't aggressive to any single site. The
 * real throttling (per-host, per-search-provider) is enforced globally
 * inside search()/fetchPage, so this stays safe even across overlapping runs.
 */
export async function processRemainingSources(manifest: RunManifest, sources: string[]): Promise<void> {
  await Promise.all(sources.map((source) => processSource(manifest, source)));
}
