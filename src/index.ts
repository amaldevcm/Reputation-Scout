#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "./lib/zodToJsonSchema.js";
import { setServer } from "./lib/mcpServer.js";

import { searchReviewsSchema, searchReviews } from "./tools/searchReviews.js";
import { fetchPageSchema, fetchPageTool } from "./tools/fetchPageTool.js";
import { researchCompanySchema, researchCompany } from "./tools/researchCompany.js";
import { resumeResearchSchema, resumeResearch } from "./tools/resumeResearch.js";
import { getResearchStatusSchema, getResearchStatus } from "./tools/getResearchStatus.js";
import { saveReportSchema, saveReportTool } from "./tools/saveReportTool.js";

const server = new Server(
  { name: "reputation-scout", version: "0.1.0" },
  { capabilities: { tools: {} } }
);
setServer(server);

const tools = [
  {
    name: "search_reviews",
    description: "Discover review-page URLs for a company on one source via Brave Search.",
    schema: searchReviewsSchema,
    handler: searchReviews,
  },
  {
    name: "fetch_page",
    description: "Fetch a URL and return cleaned, readable text extracted from the page.",
    schema: fetchPageSchema,
    handler: fetchPageTool,
  },
  {
    name: "research_company",
    description:
      "Orchestrate a full research run across default (or specified) review sources in parallel for a company. Starts a fresh run, or reports an existing incomplete run rather than silently resuming/restarting.",
    schema: researchCompanySchema,
    handler: researchCompany,
  },
  {
    name: "resume_research",
    description: "Explicitly continue an incomplete run, processing only remaining pending/failed sources.",
    schema: resumeResearchSchema,
    handler: resumeResearch,
  },
  {
    name: "get_research_status",
    description: "Check progress on a run without doing further work.",
    schema: getResearchStatusSchema,
    handler: getResearchStatus,
  },
  {
    name: "save_report",
    description:
      "Write the consolidated Markdown report to ./reports/<slug>-<date>.md. Pulls from the run manifest if findings is omitted.",
    schema: saveReportSchema,
    handler: saveReportTool,
  },
] as const;

const toolsByName = new Map<string, (typeof tools)[number]>(tools.map((t) => [t.name, t]));

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = toolsByName.get(request.params.name);
  if (!tool) {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const parsed = tool.schema.parse(request.params.arguments ?? {});
  const result = await (tool.handler as (input: unknown) => Promise<unknown>)(parsed);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("reputation-scout fatal error:", err);
  process.exit(1);
});
