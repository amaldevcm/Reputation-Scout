import { z } from "zod";
import { loadManifest } from "../lib/manifest.js";
import { saveReport } from "../lib/report.js";
import { REDACT_NAMES_DEFAULT } from "../lib/config.js";
import { REDACTION_SYNTHESIS_GUIDANCE } from "../lib/redact.js";

export const saveReportSchema = z.object({
  company_name: z.string().describe("The company the report is for."),
  findings: z
    .string()
    .optional()
    .describe(
      `The synthesized Markdown findings body, written by the host LLM from the run's extracted text. ${REDACTION_SYNTHESIS_GUIDANCE} If omitted, raw extracted findings from the run manifest are used verbatim (not synthesized).`
    ),
  redact_names: z
    .boolean()
    .optional()
    .describe("Whether to instruct redaction of individual names. Defaults to true (PII-safe by default)."),
  allow_low_coverage: z
    .boolean()
    .optional()
    .describe("Save even if fewer than 2 sources succeeded, despite the warning."),
});

export type SaveReportInput = z.infer<typeof saveReportSchema>;

export async function saveReportTool(input: SaveReportInput) {
  const manifest = await loadManifest(input.company_name);
  if (!manifest) {
    return {
      status: "no_run_found",
      message: `No run found for "${input.company_name}". Call research_company first.`,
    };
  }

  const result = await saveReport(manifest, {
    findings: input.findings,
    redactNames: input.redact_names ?? REDACT_NAMES_DEFAULT,
    allowLowCoverage: input.allow_low_coverage,
  });

  return {
    status: result.warning ? "saved_with_warning" : "saved",
    path: result.path,
    warning: result.warning,
    preview: result.preview,
  };
}
