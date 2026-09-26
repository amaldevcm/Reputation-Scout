import fs from "node:fs/promises";
import path from "node:path";
import { RUNS_DIR } from "./config.js";
import { slugify } from "./slug.js";
import type { DisambiguationHints, RunManifest, SourceRunState } from "./types.js";

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function manifestPath(companySlug: string): string {
  return path.join(RUNS_DIR, `${companySlug}.json`);
}

export async function loadManifest(companyName: string): Promise<RunManifest | null> {
  const slug = slugify(companyName);
  try {
    const raw = await fs.readFile(manifestPath(slug), "utf-8");
    return JSON.parse(raw) as RunManifest;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function saveManifest(manifest: RunManifest): Promise<void> {
  await ensureDir(RUNS_DIR);
  manifest.updatedAt = new Date().toISOString();
  await fs.writeFile(
    manifestPath(manifest.companySlug),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );
}

export function newManifest(
  companyName: string,
  sources: readonly string[],
  hints: DisambiguationHints
): RunManifest {
  const now = new Date().toISOString();
  const sourceStates: Record<string, SourceRunState> = {};
  for (const source of sources) {
    sourceStates[source] = {
      source,
      status: "pending",
      attempts: 0,
      matchedPages: [],
      findings: [],
      updatedAt: now,
    };
  }
  return {
    companyName,
    companySlug: slugify(companyName),
    hints,
    createdAt: now,
    updatedAt: now,
    sources: sourceStates,
  };
}

/**
 * Persists a single source's result immediately, so a crash/interrupt loses
 * at most one source's progress rather than the whole run.
 */
export async function updateSourceState(
  manifest: RunManifest,
  source: string,
  patch: Partial<SourceRunState>
): Promise<void> {
  const current = manifest.sources[source] ?? {
    source,
    status: "pending",
    attempts: 0,
    matchedPages: [],
    findings: [],
    updatedAt: new Date().toISOString(),
  };
  manifest.sources[source] = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await saveManifest(manifest);
}

export function pendingOrFailedSources(manifest: RunManifest): string[] {
  return Object.values(manifest.sources)
    .filter((s) => s.status === "pending" || s.status === "failed" || s.status === "in_progress")
    .map((s) => s.source);
}

export function summarize(manifest: RunManifest): string {
  const states = Object.values(manifest.sources);
  const total = states.length;
  const succeeded = states.filter((s) => s.status === "done").length;
  const blocked = states.filter((s) => s.status === "blocked").map((s) => s.source);
  const noResults = states.filter((s) => s.status === "no_results").map((s) => s.source);
  const failed = states.filter((s) => s.status === "failed").map((s) => s.source);
  const parseErrors = states.filter((s) => s.status === "parse_error").map((s) => s.source);

  const parts = [`${succeeded}/${total} sources succeeded`];
  if (blocked.length) parts.push(`${blocked.length} blocked (${blocked.join(", ")})`);
  if (noResults.length) parts.push(`${noResults.length} had no results (${noResults.join(", ")})`);
  if (failed.length) parts.push(`${failed.length} failed (${failed.join(", ")})`);
  if (parseErrors.length) parts.push(`${parseErrors.length} parse error (${parseErrors.join(", ")})`);
  return parts.join(", ");
}
