import { fetchJson } from "../sources/apis/http.js";
import { normName } from "../sources/apis/match.js";
import { normalizeDomain } from "./domain.js";

const API = "https://www.wikidata.org/w/api.php";

interface EntitySearch {
  search?: { id: string; label?: string }[];
}
interface Claims {
  claims?: { P856?: { mainsnak?: { datavalue?: { value?: unknown } } }[] };
}

async function officialWebsite(entityId: string): Promise<string | null> {
  const data = await fetchJson<Claims>(`${API}?action=wbgetclaims&entity=${entityId}&property=P856&format=json`);
  const value = data.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === "string" ? normalizeDomain(value) : null;
}

/**
 * Looks a company up on Wikidata and returns its official website's domain,
 * so the direct-URL sources (Trustpilot, SiteJabber) work when the caller
 * gave no domain. Best effort: it returns a domain only when exactly one
 * entity carries the company's exact name *and* an official website, which
 * rules out look-alikes ("Stripe" the company vs "stripe" the pattern). Any
 * failure or ambiguity returns null, never a guess.
 */
export async function resolveOfficialDomain(companyName: string): Promise<string | null> {
  try {
    const found = await fetchJson<EntitySearch>(
      `${API}?action=wbsearchentities&search=${encodeURIComponent(companyName)}&language=en&type=item&limit=5&format=json`
    );
    const wanted = normName(companyName);
    const sameName = (found.search ?? []).filter((c) => c.label && normName(c.label) === wanted);

    const domains = new Set<string>();
    for (const candidate of sameName) {
      const domain = await officialWebsite(candidate.id);
      if (domain) domains.add(domain);
    }
    return domains.size === 1 ? [...domains][0] : null;
  } catch {
    return null;
  }
}
