import { fetchPage } from "../fetch/fetchPage.js";
import { redactStructuralPII } from "../report/redact.js";
import { updateSourceState } from "./manifest.js";
import { resolveMatchedPages } from "../sources/context.js";
import { CHAINS } from "../sources/chains.js";
import { runChain } from "./runChain.js";
import { DATA_SOURCES, type DataSource } from "../sources/apis/index.js";
import { classifyMessage, describeError, type FailureReason } from "./failure.js";
import type { ExtractedFinding, MatchedPage, RunManifest } from "../types.js";

/**
 * Runs a source that is answered by a structured API (see sources/apis)
 * rather than by fetching pages. The adapter returns finished finding text.
 */
async function processDataSource(manifest: RunManifest, source: string, dataSource: DataSource): Promise<void> {
  try {
    const result = await dataSource(manifest.companyName, manifest.hints);

    if (result.kind === "ok") {
      await updateSourceState(manifest, source, {
        status: "done",
        matchedPages: result.pages,
        findings: result.findings.map((f) => ({ ...f, text: redactStructuralPII(f.text), redacted: true })),
        detail: result.detail,
      });
    } else if (result.kind === "not_applicable") {
      await updateSourceState(manifest, source, { status: "not_applicable", detail: result.reason });
    } else {
      await updateSourceState(manifest, source, { status: "no_results" });
    }
  } catch (err) {
    await markFailed(manifest, source, describeError(err));
  }
}

async function markFailed(
  manifest: RunManifest,
  source: string,
  failure: { error: string; reason: FailureReason },
  matchedPages?: MatchedPage[]
): Promise<void> {
  await updateSourceState(manifest, source, {
    status: "failed",
    ...(matchedPages && { matchedPages }),
    attempts: (manifest.sources[source]?.attempts ?? 0) + 1,
    ...failure,
  });
}

async function processSource(manifest: RunManifest, source: string): Promise<void> {
  // Clear what a previous attempt left behind so a retried source doesn't carry a stale error.
  await updateSourceState(manifest, source, {
    status: "in_progress",
    error: undefined,
    reason: undefined,
    detail: undefined,
  });

  const chain = CHAINS[source];
  if (chain && (await runChain(manifest, source, chain))) return;

  const dataSource = DATA_SOURCES[source];
  if (dataSource) {
    await processDataSource(manifest, source, dataSource);
    return;
  }

  const resolution = await resolveMatchedPages(manifest, source);

  if ("error" in resolution) {
    await markFailed(manifest, source, resolution);
    return;
  }

  if ("noResults" in resolution) {
    await updateSourceState(manifest, source, { status: "no_results" });
    return;
  }

  const { matchedPages, provider } = resolution;
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
    await updateSourceState(manifest, source, {
      status: "done",
      matchedPages,
      findings,
      ...(provider && { detail: `${matchedPages.length} page(s) matched via ${provider}` }),
    });
  } else if (sawBlocked) {
    await updateSourceState(manifest, source, {
      status: "blocked",
      matchedPages,
      error: lastError,
      reason: "bot_blocked",
    });
  } else if (sawParseError) {
    await updateSourceState(manifest, source, { status: "parse_error", matchedPages, error: lastError });
  } else if (sawFailed) {
    await markFailed(manifest, source, { error: lastError, reason: classifyMessage(lastError) }, matchedPages);
  } else if (sawNotFound) {
    // Every candidate was a clean 404 (a direct-URL guess with no presence
    // at that address) — the company just isn't on this source, not a
    // failure to reach it.
    await updateSourceState(manifest, source, { status: "no_results", matchedPages });
  } else {
    await markFailed(manifest, source, { error: lastError || "unknown error", reason: "unknown" }, matchedPages);
  }
}

/**
 * Per-run fan-out across sources is fully parallel by design — 8 concurrent
 * requests to 8 different hosts isn't aggressive to any single site. The
 * real throttling (per-host, per-search-provider) is enforced globally
 * inside search()/fetchPage/resolvers, so this stays safe even across
 * overlapping runs.
 */
export async function runSources(manifest: RunManifest, sources: string[]): Promise<void> {
  await Promise.all(sources.map((source) => processSource(manifest, source)));
}
