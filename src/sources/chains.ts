import { apifyProvider } from "../providers/apify.js";
import { brightDataProvider } from "../providers/brightdata.js";
import { serpApiProvider } from "../providers/serpapi.js";
import { yelpProvider } from "../providers/yelp.js";
import {
  directProvider,
  jinaProvider,
  firecrawlScrapeProvider,
  searchPreviewProvider,
  redditPreviewProvider,
} from "../providers/readers.js";
import type { ReviewProvider } from "../providers/types.js";

/**
 * Per-source provider chains, tried in order until one returns usable content.
 * A provider whose key, flag or quota is missing is skipped. Sources not listed
 * here keep the original resolve-then-fetch behavior, and so does a listed
 * source when none of its providers is enabled.
 */
export const CHAINS: Record<string, ReviewProvider[]> = {
  glassdoor: [apifyProvider, brightDataProvider, firecrawlScrapeProvider, searchPreviewProvider],
  indeed: [apifyProvider, brightDataProvider, firecrawlScrapeProvider, searchPreviewProvider],
  g2: [apifyProvider, firecrawlScrapeProvider, brightDataProvider, searchPreviewProvider],
  trustpilot: [apifyProvider, firecrawlScrapeProvider, jinaProvider],
  google_reviews: [serpApiProvider, apifyProvider],
  yelp: [yelpProvider, apifyProvider],
  bbb: [directProvider, jinaProvider, firecrawlScrapeProvider],
  sitejabber: [directProvider, jinaProvider, firecrawlScrapeProvider],
  reddit: [redditPreviewProvider, apifyProvider],
  linkedin: [brightDataProvider, searchPreviewProvider],
  clutch: [directProvider, jinaProvider, firecrawlScrapeProvider, searchPreviewProvider],
};
