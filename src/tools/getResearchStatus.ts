import { z } from "zod";
import { loadManifest, summarize } from "../pipeline/manifest.js";

export const getResearchStatusSchema = z.object({
  company_name: z.string().describe("The company whose run status to check."),
});

export type GetResearchStatusInput = z.infer<typeof getResearchStatusSchema>;

export async function getResearchStatus(input: GetResearchStatusInput) {
  const manifest = await loadManifest(input.company_name);
  if (!manifest) {
    return {
      status: "no_run_found",
      message: `No run found for "${input.company_name}". Call research_company to start one.`,
    };
  }

  return {
    status: "found",
    summary: summarize(manifest),
    sources: Object.fromEntries(
      Object.entries(manifest.sources).map(([source, state]) => [source, state.status])
    ),
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  };
}
