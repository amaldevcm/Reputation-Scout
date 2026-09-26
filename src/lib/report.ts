import fs from "node:fs/promises";
import path from "node:path";
import { REPORTS_DIR, MIN_VIABLE_SOURCES } from "./config.js";
import { redactStructuralPII, REDACTION_SYNTHESIS_GUIDANCE } from "./redact.js";
import { summarize, overallConfidence } from "./manifest.js";
import { extractReviewCount, extractRating } from "./extractSignals.js";
import { summarizeConsolidatedFindings } from "./summarize.js";
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

function buildCompanySection(manifest: RunManifest): string {
  const website = manifest.hints.domain ?? "not provided";
  const { level, basis } = overallConfidence(manifest);

  return [
    "## Company",
    "",
    `- **Name:** ${manifest.companyName}`,
    `- **Website:** ${website}`,
    `- **Overall confidence:** ${level} — ${basis}`,
  ].join("\n");
}

function buildSourceSignalsSection(manifest: RunManifest): string {
  const rows = Object.values(manifest.sources).map((s) => {
    const combinedText = s.findings.map((f) => f.text).join(" ");
    const reviewCount = combinedText ? (extractReviewCount(combinedText) ?? "not detected") : "—";
    const rating = combinedText ? (extractRating(combinedText) ?? "not detected") : "—";

    // Prefer the page an actual finding came from; fall back to the best
    // candidate the source turned up even if fetching it didn't pan out.
    const bestPage = s.matchedPages[0];
    const matchedVia = bestPage ? bestPage.matchedOn.join(", ") : "—";
    const confidence = bestPage ? bestPage.confidence : "—";

    return `| ${s.source} | ${reviewCount} | ${rating} | ${matchedVia} | ${confidence} |`;
  });

  return [
    "## Source signals",
    "",
    "| Source | Reviews found | Rating | Matched via | Confidence |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "_\"Reviews found\" and \"Rating\" are extracted from page text with simple pattern matching and may miss or misread a source's actual formatting — treat as an approximate signal, not an authoritative count. \"—\" means not applicable (no findings from that source); \"not detected\" means findings exist but no count/rating pattern was found in them._",
  ].join("\n");
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

  let findingsBody: string;
  let summaryNote = "";

  if (options.findings) {
    findingsBody = options.findings;
  } else {
    const perSourceRaw = Object.values(manifest.sources)
      .filter((s) => s.findings.length > 0)
      .map((s) => ({ source: s.source, text: s.findings.map((f) => f.text).join("\n\n") }));

    const summaries = await summarizeConsolidatedFindings(perSourceRaw, {
      redactNames,
    });

    if (summaries) {
      findingsBody = perSourceRaw
        .map(({ source, text }) => `### ${source}\n\n${summaries[source] ?? text}`)
        .join("\n\n");
      summaryNote =
        "_Findings below are LLM-generated 1-2 sentence summaries of each source's extracted text, via MCP sampling through the connected client. Sources without an entry above didn't produce a summary and show the raw extracted text instead._";
    } else {
      findingsBody = perSourceRaw.map(({ source, text }) => `### ${source}\n\n${text}`).join("\n\n");
      if (perSourceRaw.length > 0) {
        summaryNote =
          "_LLM summarization unavailable (the connected client doesn't support MCP sampling, or the request failed) — showing raw extracted text._";
      }
    }
  }

  const bodyRedacted = redactStructuralPII(findingsBody);

  const noHints = !manifest.hints.domain && !manifest.hints.location && !manifest.hints.industry_hint;
  const disclaimer = noHints
    ? `> No disambiguation hints (domain/location/industry) were provided for this run. Review the "Sources" and "⚠ Unverified matches" sections below to confirm these results are about the intended company.`
    : "";

  const unverified = buildUnverifiedSection(manifest);

  const findingsBlock = [
    "## Findings",
    summaryNote,
    bodyRedacted || "_No findings recorded._",
  ]
    .filter(Boolean)
    .join("\n\n");

  const blocks = [
    `# Reputation report: ${manifest.companyName}`,
    `_Generated ${todayStamp()}._`,
    disclaimer,
    buildCompanySection(manifest),
    buildSourceSignalsSection(manifest),
    findingsBlock,
    buildSourcesSection(manifest),
    unverified,
  ].filter((b): b is string => Boolean(b && b.trim()));

  const content = blocks.join("\n\n") + "\n";

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const filePath = path.join(REPORTS_DIR, `${manifest.companySlug}-${todayStamp()}.md`);
  await fs.writeFile(filePath, content, "utf-8");

  return { path: filePath, warning };
}
