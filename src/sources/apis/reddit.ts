import { search } from "../../search/index.js";
import { scoreMatch } from "../../pipeline/disambiguate.js";
import { clip } from "./format.js";
import { hostnameOf } from "../../fetch/throttle.js";
import type { MatchedPage } from "../../types.js";
import type { DataSource } from "./types.js";

const MAX_RESULTS = 8;

/**
 * Reddit blocks direct page fetches (even through a reader proxy) and has no
 * anonymous search, so this uses the search provider's own result text
 * instead: titles and snippets of Reddit threads that mention the company.
 * That gives the thread links and a preview of what people said, not the full
 * discussion.
 */
export const redditSource: DataSource = async (companyName, hints) => {
  const terms = '(reviews OR complaints OR scam OR "worked at" OR experience)';
  const query = [`"${companyName}"`, terms, "site:reddit.com", hints.domain, hints.location]
    .filter(Boolean)
    .join(" ");

  const { provider, results } = await search(query, 15);
  const threads = results
    .filter((r) => {
      const host = hostnameOf(r.url);
      return host === "reddit.com" || host.endsWith(".reddit.com");
    })
    .slice(0, MAX_RESULTS);
  if (threads.length === 0) return { kind: "no_results" };

  const pages: MatchedPage[] = threads.map((r) => {
    const { confidence, matchedOn } = scoreMatch(companyName, hints, r);
    return { url: r.url, title: r.title, confidence, matchedOn };
  });

  const lines = [
    `Reddit threads that mention "${companyName}" (found via ${provider} search; Reddit itself blocks direct access):`,
    ...threads.map((r) => {
      // Providers that return a long excerpt (Parallel, Firecrawl) give a fuller preview than a snippet.
      const preview = r.excerpt ?? r.snippet;
      return `- "${clip(r.title, 120)}" ${r.url}${preview ? `\n  Preview: ${clip(preview, r.excerpt ? 600 : 300)}` : ""}`;
    }),
    "Note: these are search previews, not the full threads. Open the links to read the discussion. Matching is by name, so check the threads are about the intended company.",
  ];

  return {
    kind: "ok",
    detail: `${threads.length} thread(s) via ${provider}`,
    pages,
    findings: [{ url: pages[0].url, text: lines.join("\n"), redacted: true }],
  };
};
