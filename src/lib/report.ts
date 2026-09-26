import fs from "node:fs/promises";
import path from "node:path";
import { REPORTS_DIR, MIN_VIABLE_SOURCES } from "./config.js";
import { redactStructuralPII } from "./redact.js";
import { summarize } from "./manifest.js";
import { todayStamp } from "./slug.js";
import type { RunManifest } from "./types.js";

export interface SaveReportOptions {
  findings?: string;
  redactNames?: boolean;
  allowLowCoverage?: boolean;
}

export interface SaveReportResult {
  path: string;
  warning?: string;
}

function buildSourcesSection(manifest: RunManifest): string {
  const rows = Object.values(manifest.sources).map((s) => {
    const detail =
      s.status === "blocked" || s.status === "failed" || s.status === "parse_error"
        ? s.error ?? s.status
        : s.status === "no_results"
          ? "no results found"
          : s.status === "done"
            ? `${s.matchedPages.length} page(s) matched`
            : s.status;
    return `| ${s.source} | ${s.status} | ${detail} |`;
  });

  return [
    "## Sources",
    "",
    "| Source | Status | Detail |",
    "| --- | --- | --- |",
    ...rows,
    "",
    `_${summarize(manifest)}._`,
  ].join("\n");
}

function buildUnverifiedSection(manifest: RunManifest): string | null {
  const lowConfidence = Object.values(manifest.sources).flatMap((s) =>
    s.matchedPages.filter((p) => p.confidence === "low").map((p) => ({ source: s.source, page: p }))
  );
  if (lowConfidence.length === 0) return null;

  const lines = lowConfidence.map(
    ({ source, page }) => `- **${source}**: [${page.title ?? page.url}](${page.url}) (matched on: ${page.matchedOn.join(", ")})`
  );
  return ["## ⚠ Unverified matches", "", ...lines].join("\n");
}

export async function saveReport(
  manifest: RunManifest,
  options: SaveReportOptions = {}
): Promise<SaveReportResult> {
  const redactNames = options.redactNames ?? true;
  const succeeded = Object.values(manifest.sources).filter((s) => s.status === "done").length;

  let warning: string | undefined;
  if (succeeded < MIN_VIABLE_SOURCES && !options.allowLowCoverage) {
    warning = `Only ${succeeded} source(s) succeeded (minimum viable is ${MIN_VIABLE_SOURCES}). This report may not be representative; pass allowLowCoverage to save anyway.`;
  }

  const findingsBody =
    options.findings ??
    Object.values(manifest.sources)
      .flatMap((s) => s.findings.map((f) => `### ${s.source} — ${f.url}\n\n${f.text}`))
      .join("\n\n");

  const bodyRedacted = redactStructuralPII(findingsBody);

  const noHints = !manifest.hints.domain && !manifest.hints.location && !manifest.hints.industry_hint;
  const disclaimer = noHints
    ? `> No disambiguation hints (domain/location/industry) were provided for this run. Review the "Sources" and "⚠ Unverified matches" sections below to confirm these results are about the intended company.\n\n`
    : "";

  const unverified = buildUnverifiedSection(manifest);

  const lines = [
    `# Reputation report: ${manifest.companyName}`,
    "",
    `_Generated ${todayStamp()}._`,
    "",
    disclaimer,
    "## Findings",
    "",
    bodyRedacted || "_No findings recorded._",
    "",
    buildSourcesSection(manifest),
  ];

  if (unverified) {
    lines.push("", unverified);
  }

  const content = lines.filter((l) => l !== "").join("\n") + "\n";

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const filePath = path.join(REPORTS_DIR, `${manifest.companySlug}-${todayStamp()}.md`);
  await fs.writeFile(filePath, content, "utf-8");

  return { path: filePath, warning };
}
