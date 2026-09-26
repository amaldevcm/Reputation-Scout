# Reputation-Scout

Reputation Scout is a multi-agent-orchestrated company-reputation research tool, built as an MCP (Model Context Protocol) server so it can be plugged into any MCP-compatible coding agent (Claude Code, Cursor, etc.).

Given a company name, it searches multiple review sources (Glassdoor, Indeed, Clutch, G2, BBB, Reddit, LinkedIn, Google Reviews, SiteJabber by default), consolidates findings into a Markdown report, and tracks progress so a long run can survive context compaction or an interrupted session.

## Status

Phase 1 (core functionality) — built, used locally during development via manual MCP config. Not yet published to npm (Phase 3) and not yet legally reviewed for public distribution (Phase 2) — see `research_company`'s and `save_report`'s tool descriptions for the redaction/disclaimer behavior already in place.

## Setup

```bash
npm install
npm run build
```

No API key required to get started. Two sources (**BBB**, **SiteJabber**) resolve directly via the site's own predictable, plain-fetchable URLs, never touching a search API at all. Everything else falls back to a key-free DuckDuckGo scrape when no search API key is set.

For everything else, search picks a provider in this order:

1. **[Tavily](https://tavily.com/)** (`TAVILY_API_KEY`) — recommended. Free tier, 1,000 credits/month, no credit card required.
2. **[Brave Search](https://brave.com/search/api/)** (`BRAVE_API_KEY`) — supported if you already have a key, but as of February 2026 Brave requires a credit card at signup (no longer a true no-cost free tier).
3. **DuckDuckGo** (no key) — scrapes an unofficial HTML endpoint; prone to being IP-flagged as bot traffic under repeated use, so treat it as a fallback rather than a reliable default for heavy use.

## Adding it to a coding agent

```json
{
  "mcpServers": {
    "reputation-scout": {
      "command": "node",
      "args": ["/absolute/path/to/Reputation-Scout/dist/index.js"]
    }
  }
}
```

To use Tavily or Brave instead of the DuckDuckGo fallback, add `"env": { "TAVILY_API_KEY": "..." }` (or `"BRAVE_API_KEY"`) to the server entry above.

For Claude Code: `.claude/mcp.json` or `claude mcp add`. For Cursor: `.cursor/mcp.json`. Once published to npm (Phase 3), `command`/`args` will switch to `npx -y reputation-scout`.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_reviews(company_name, source?, domain?, location?)` | Discover review-page URLs for one source via Tavily/Brave/DuckDuckGo |
| `fetch_page(url)` | Fetch a URL and return cleaned/readable text |
| `research_company(company_name, sources?, domain?, location?, industry_hint?, restart?)` | Orchestrate a full run across sources in parallel |
| `resume_research(company_name)` | Continue an incomplete run, processing only remaining sources |
| `get_research_status(company_name)` | Check progress without doing further work |
| `save_report(company_name, findings?, redact_names?, allow_low_coverage?)` | Write the consolidated Markdown report to `./reports/<slug>-<date>.md` |

## Findings summarization

`save_report` (when called without its own `findings` argument) tries to condense each source's raw extracted text into a 1-2 sentence summary using **MCP sampling** (`sampling/createMessage`) — a request back to whichever host client is connected, asking *its* configured model to do the summarization. No separate LLM API key needed: the host picks the model, Reputation Scout just asks for one biased toward cheap/fast (`modelPreferences.costPriority`), since it's a short extractive task.

This needs the connected client to support sampling. Not all MCP clients do yet — when unsupported (or the request fails), the report falls back to showing each source's raw extracted text, same as before this existed, with a note saying so.

## Maintenance

```bash
npm run clean-cache
```

Removes expired entries from the page cache (`.cache/pages`, 7-day TTL by default).
