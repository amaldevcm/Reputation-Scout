# Reputation-Scout

Reputation Scout is a multi-agent-orchestrated company-reputation research tool, built as an MCP (Model Context Protocol) server so it can be plugged into any MCP-compatible coding agent (Claude Code, Cursor, etc.).

Given a company name, it searches multiple review sources (Glassdoor, Indeed, Clutch, G2, BBB, Reddit, LinkedIn, Google Reviews by default), consolidates findings into a Markdown report, and tracks progress so a long run can survive context compaction or an interrupted session.

## Status

Phase 1 (core functionality) — built, used locally during development via manual MCP config. Not yet published to npm (Phase 3) and not yet legally reviewed for public distribution (Phase 2) — see `research_company`'s and `save_report`'s tool descriptions for the redaction/disclaimer behavior already in place.

## Setup

```bash
npm install
npm run build
```

No API key required to get started — search falls back to a key-free DuckDuckGo scrape when `BRAVE_API_KEY` isn't set. Setting a [Brave Search API](https://brave.com/search/api/) key is optional but recommended: it's an official, higher-quality, rate-limit-friendly source, whereas the DuckDuckGo fallback scrapes an unofficial HTML endpoint and is more likely to break or get rate-limited under heavy use.

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

To use Brave instead of the DuckDuckGo fallback, add `"env": { "BRAVE_API_KEY": "..." }` to the server entry above.

For Claude Code: `.claude/mcp.json` or `claude mcp add`. For Cursor: `.cursor/mcp.json`. Once published to npm (Phase 3), `command`/`args` will switch to `npx -y reputation-scout`.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_reviews(company_name, source?, domain?, location?)` | Discover review-page URLs for one source via Brave Search |
| `fetch_page(url)` | Fetch a URL and return cleaned/readable text |
| `research_company(company_name, sources?, domain?, location?, industry_hint?, restart?)` | Orchestrate a full run across sources in parallel |
| `resume_research(company_name)` | Continue an incomplete run, processing only remaining sources |
| `get_research_status(company_name)` | Check progress without doing further work |
| `save_report(company_name, findings?, redact_names?, allow_low_coverage?)` | Write the consolidated Markdown report to `./reports/<slug>-<date>.md` |

## Maintenance

```bash
npm run clean-cache
```

Removes expired entries from the page cache (`.cache/pages`, 7-day TTL by default).
