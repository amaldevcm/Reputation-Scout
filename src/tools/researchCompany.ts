import { z } from "zod";
import { DEFAULT_SOURCES } from "../types.js";
import { loadManifest, newManifest, saveManifest, summarize } from "../pipeline/manifest.js";
import { runSources } from "../pipeline/runSources.js";
import { hasAnyHints } from "../pipeline/disambiguate.js";
import { unresolvedResult } from "../pipeline/unresolved.js";

export const researchCompanySchema = z.object({
  company_name: z.string().describe("The company to research."),
  sources: z
    .array(z.string())
    .optional()
    .describe(`Sources to check. Defaults to: ${DEFAULT_SOURCES.join(", ")}.`),
  domain: z.string().optional().describe("Company domain — the strongest disambiguation signal."),
  location: z.string().optional().describe("Company location, for disambiguation."),
  industry_hint: z.string().optional().describe("Industry hint, for disambiguation."),
  restart: z
    .boolean()
    .optional()
    .describe("Discard any existing manifest for this company and start a clean run."),
});

export type ResearchCompanyInput = z.infer<typeof researchCompanySchema>;

export async function researchCompany(input: ResearchCompanyInput) {
  const sources = input.sources ?? [...DEFAULT_SOURCES];
  const hints = {
    domain: input.domain,
    location: input.location,
    industry_hint: input.industry_hint,
  };

  let manifest = await loadManifest(input.company_name);

  if (manifest && !input.restart) {
    const incomplete = Object.values(manifest.sources).some(
      (s) => s.status === "pending" || s.status === "in_progress" || s.status === "failed"
    );
    if (incomplete) {
      return {
        status: "existing_incomplete_run",
        summary: summarize(manifest),
        message:
          "An incomplete run already exists for this company. Call resume_research to continue it, or pass restart: true to start over.",
      };
    }
  }

  if (!manifest || input.restart) {
    manifest = newManifest(input.company_name, sources, hints);
    await saveManifest(manifest);
  }

  const disclaimerNeeded = !hasAnyHints(hints);

  await runSources(manifest, sources);

  return {
    status: "completed",
    summary: summarize(manifest),
    ...unresolvedResult(manifest),
    disclaimer: disclaimerNeeded
      ? "No disambiguation hints (domain/location/industry_hint) were provided; review low-confidence matches before trusting the report."
      : undefined,
  };
}
