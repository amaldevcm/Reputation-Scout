import { getServer } from "./mcpServer.js";
import { REDACTION_SYNTHESIS_GUIDANCE } from "./redact.js";

const MAX_CHARS_PER_SOURCE = 4000;

export interface SourceText {
  source: string;
  text: string;
}

/**
 * Whether the connected MCP client declared support for sampling
 * (`sampling/createMessage`) during initialize. Not all clients do — this
 * is the gate for graceful fallback to raw-text findings.
 */
export function samplingAvailable(): boolean {
  const server = getServer();
  if (!server) return false;
  const caps = server.getClientCapabilities();
  return Boolean(caps?.sampling);
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * One combined sampling request over every source's already-consolidated
 * raw findings, asking for a 1-2 sentence summary per source — a single
 * pass rather than one call per source. Returns null (caller falls back to
 * raw text) if sampling isn't supported by the client, the call fails, or
 * the response can't be parsed as the expected per-source JSON map.
 */
export async function summarizeConsolidatedFindings(
  sources: SourceText[],
  options: { redactNames?: boolean } = {}
): Promise<Record<string, string> | null> {
  const server = getServer();
  if (!server || !samplingAvailable() || sources.length === 0) return null;

  const body = sources
    .map((s) => `### ${s.source}\n${s.text.slice(0, MAX_CHARS_PER_SOURCE)}`)
    .join("\n\n");

  const redactionClause = options.redactNames === false ? "" : ` ${REDACTION_SYNTHESIS_GUIDANCE}`;

  try {
    const result = await server.createMessage({
      messages: [
        {
          role: "user",
          content: { type: "text", text: body },
        },
      ],
      systemPrompt:
        "You summarize review-site excerpts for a company reputation report. " +
        "For each source section below (headed '### <source>'), write exactly " +
        "1-2 sentences capturing the overall sentiment and any concrete, " +
        "recurring praise or complaint actually present in that source's text. " +
        "Do not invent facts not present in the text. Keep any redaction " +
        "placeholders (e.g. [redacted-email]) as-is rather than removing them." +
        redactionClause +
        " Respond with ONLY strict JSON mapping each source name to its summary " +
        'string, e.g. {"glassdoor": "...", "sitejabber": "..."} — no other text.',
      maxTokens: 800,
      modelPreferences: {
        // Hints, not a guarantee — the client has final discretion over which
        // model actually runs this. Biased toward a cheap/fast model since
        // this is a short extractive-summary task, not deep reasoning.
        costPriority: 0.9,
        speedPriority: 0.7,
        intelligencePriority: 0.2,
      },
    });

    if (result.content.type !== "text") return null;

    const parsed = JSON.parse(extractJson(result.content.text));
    if (typeof parsed !== "object" || parsed === null) return null;

    const summaries: Record<string, string> = {};
    for (const s of sources) {
      const value = parsed[s.source];
      if (typeof value === "string" && value.trim()) {
        summaries[s.source] = value.trim();
      }
    }
    return Object.keys(summaries).length > 0 ? summaries : null;
  } catch {
    return null;
  }
}
