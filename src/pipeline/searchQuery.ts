const SOURCE_SITE_HINTS: Record<string, string> = {
  glassdoor: "site:glassdoor.com",
  indeed: "site:indeed.com",
  clutch: "site:clutch.co",
  g2: "site:g2.com",
  bbb: "site:bbb.org",
  reddit: "site:reddit.com",
  linkedin: "site:linkedin.com",
  google_reviews: "google reviews",
  sitejabber: "site:sitejabber.com",
  trustpilot: "site:trustpilot.com",
};

export function buildQuery(
  companyName: string,
  source: string,
  hints: { domain?: string; location?: string }
): string {
  const siteHint = SOURCE_SITE_HINTS[source] ?? "";
  const parts = [companyName, "reviews", siteHint];
  if (hints.domain) parts.push(hints.domain);
  if (hints.location) parts.push(hints.location);
  return parts.filter(Boolean).join(" ");
}
