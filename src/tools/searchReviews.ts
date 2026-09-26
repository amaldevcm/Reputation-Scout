import { z } from "zod";
import { search } from "../lib/search/index.js";
import { buildQuery } from "../lib/searchQuery.js";

export const searchReviewsSchema = z.object({
  company_name: z.string().describe("The company to search reviews for."),
  source: z
    .string()
    .optional()
    .describe(
      "A single source key to search (e.g. glassdoor, indeed, clutch, g2, bbb, reddit, linkedin, google_reviews). Omit to run a generic reviews search."
    ),
  domain: z.string().optional().describe("Company domain, used to disambiguate the query."),
  location: z.string().optional().describe("Company location, used to disambiguate the query."),
});

export type SearchReviewsInput = z.infer<typeof searchReviewsSchema>;

export async function searchReviews(input: SearchReviewsInput) {
  const source = input.source ?? "general";
  const query = buildQuery(input.company_name, source, {
    domain: input.domain,
    location: input.location,
  });
  const { provider, results } = await search(query);
  return {
    source,
    query,
    provider,
    results,
  };
}
