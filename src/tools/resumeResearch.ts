import { z } from "zod";
import { loadManifest, pendingOrFailedSources, summarize, saveManifest } from "../lib/manifest.js";
import { processRemainingSources } from "../lib/processRemaining.js";

export const resumeResearchSchema = z.object({
  company_name: z.string().describe("The company whose incomplete run should be continued."),
});

export type ResumeResearchInput = z.infer<typeof resumeResearchSchema>;

export async function resumeResearch(input: ResumeResearchInput) {
  const manifest = await loadManifest(input.company_name);
  if (!manifest) {
    return {
      status: "no_run_found",
      message: `No run found for "${input.company_name}". Call research_company to start one.`,
    };
  }

  const remaining = pendingOrFailedSources(manifest);
  if (remaining.length === 0) {
    return { status: "already_complete", summary: summarize(manifest) };
  }

  // Reset in_progress sources left over from an interrupted run to pending,
  // and reuse the same processing path as research_company — but only for
  // the remaining sources.
  for (const source of remaining) {
    manifest.sources[source].status = "pending";
  }
  await saveManifest(manifest);

  await processRemainingSources(manifest, remaining);

  return { status: "completed", summary: summarize(manifest) };
}
