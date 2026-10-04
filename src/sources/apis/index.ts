import { cfpbSource } from "./cfpb.js";
import { edgarSource } from "./edgar.js";
import { courtListenerSource } from "./courtlistener.js";
import { hackerNewsSource } from "./hackernews.js";
import { gdeltSource } from "./gdelt.js";
import { appStoreSource } from "./appstore.js";
import { redditSource } from "./reddit.js";
import type { DataSource } from "./types.js";

export type { DataSource };

/**
 * Sources answered by a structured API (or search-provider snippets) instead
 * of by fetching and reading a page. A source listed here never goes through
 * the resolver / fetchPage path. Every one is free and needs no API key
 * (Reddit uses whichever search provider is configured).
 */
export const DATA_SOURCES: Record<string, DataSource> = {
  cfpb: cfpbSource,
  sec_edgar: edgarSource,
  courtlistener: courtListenerSource,
  hacker_news: hackerNewsSource,
  news: gdeltSource,
  app_store: appStoreSource,
  reddit: redditSource,
};
