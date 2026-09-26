import { z } from "zod";
import { fetchPage } from "../lib/fetchPage.js";

export const fetchPageSchema = z.object({
  url: z.string().url().describe("The URL to fetch and extract readable text from."),
});

export type FetchPageInput = z.infer<typeof fetchPageSchema>;

export async function fetchPageTool(input: FetchPageInput) {
  const outcome = await fetchPage(input.url);
  return { url: input.url, ...outcome };
}
