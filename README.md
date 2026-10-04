# Reputation-Scout

Reputation Scout is a multi-agent-orchestrated company-reputation research tool, built as an MCP (Model Context Protocol) server so it can be plugged into any MCP-compatible coding agent (Claude Code, Cursor, etc.).

Given a company name, it searches multiple review sources (Glassdoor, Indeed, Clutch, G2, BBB, Reddit, LinkedIn, Google Reviews, SiteJabber, Trustpilot by default) and free public-record sources (CFPB complaints, SEC filings, federal court dockets, Hacker News, news coverage, App Store ratings), consolidates findings into a Markdown report, and tracks progress so a long run can survive context compaction or an interrupted session.

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

## Sources

Every source below is free and works without an API key.

| Source | What it adds | Notes |
| --- | --- | --- |
| `bbb`, `sitejabber`, `trustpilot` | Review pages resolved directly from the company's domain | `trustpilot` is bot-walled to a plain fetch and is read through the Jina Reader fallback (below). Without a `domain` hint these fall back to search |
| `cfpb` | Consumer complaints against the company ([CFPB database](https://cfpb.github.io/ccdb5-api/)): volume, top issues, response timeliness | Financial products and services only |
| `sec_edgar` | Recent 10-K/10-Q/8-K filings mentioning litigation, regulatory-order or accounting-problem terms | Public companies only. Reported as `not_applicable` for private ones. A term hit is not a confirmed incident |
| `courtlistener` | Federal court dockets naming the company ([CourtListener](https://www.courtlistener.com/)) | Matched on case name only, so same-named companies can mix. A docket is not an outcome |
| `hacker_news` | Stories mentioning the company ([HN search](https://hn.algolia.com/api)) | Tech-industry opinion; mostly empty for other sectors |
| `news` | Recent headlines and average tone ([GDELT](https://www.gdeltproject.org/)) | GDELT limits clients to one request per 5 seconds and rate-limits aggressively, so this source can fail under repeated use |
| `app_store` | Apple App Store rating and the latest reviews for apps the company publishes | Latest reviews only; Google Play is not covered |
| `reddit` | Reddit threads mentioning the company, found through the search provider | Needs a Tavily or Brave key to be reliable (the DuckDuckGo fallback often gets bot-checked). Search previews only, since Reddit blocks direct access |

Sources the tool cannot read without paying or breaking a site's rules (G2, Indeed, Glassdoor, LinkedIn, Google reviews) are still attempted through search but frequently end up `blocked` or `failed`.

A source that cannot apply to a company (for example SEC filings for a private company) is reported as `not_applicable` rather than `no_results`.

### Page-read fallback

When a direct fetch is blocked (403/429 or a bot-check page), `fetch_page` retries through [Jina Reader](https://jina.ai/reader/) (`r.jina.ai`), which sometimes gets through. This sends the page URL to Jina. Set `REPSCOUT_JINA_FALLBACK=false` to turn it off, or `JINA_API_KEY` to raise the rate limit. Pages it cannot read (G2, Reddit) stay `blocked`.

### When a source can't be reached

A source that fails never ends as a bare error. Each unresolved source gets:

- a **reason** (`no_search_key`, `rate_limited`, `bot_blocked`, `service_down`) with a one-line fix, grouped under **Run health** in the report;
- a **Check manually** link that opens the company's lookup on that site, built from a fixed URL template so it works even when everything automatic failed;
- an entry in the `unresolved` list returned by `research_company` and `resume_research` (`source`, `why`, `remedy`, `lookup_url`), so the calling agent can open the link with its own tools or fix the cause and call `resume_research`.

Empty answers from the public-record sources (CFPB, SEC, courts, Hacker News, news, App Store) are treated as real answers and don't get a manual link.

### Optional environment variables

| Variable | Purpose |
| --- | --- |
| `REPSCOUT_CONTACT_EMAIL` | Added to the User-Agent of public-API calls. The SEC asks automated clients to identify themselves |
| `REPSCOUT_JINA_FALLBACK` | Set to `false` to disable the Jina Reader fallback |
| `JINA_API_KEY` | Higher Jina Reader rate limit |

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
