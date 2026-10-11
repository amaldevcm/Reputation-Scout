import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceContext } from "../../src/providers/types.js";

// config.ts reads keys at import time, so set the key and load the module fresh.
async function load(key = "test-key") {
  vi.stubEnv("SERPAPI_KEY", key);
  vi.resetModules();
  return import("../../src/providers/serpapi.js");
}

const ctx = { source: "google_reviews", companyName: "Acme", hints: { location: "Austin" } } as SourceContext;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("serpApiProvider", () => {
  beforeEach(() => {
    vi.stubEnv("REPSCOUT_QUOTA_SERPAPI", "100000");
  });

  it("finds the place, then maps its reviews", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ place_results: { data_id: "D1", title: "Acme HQ", rating: 4.1, link: "https://maps/acme" } })
      )
      .mockResolvedValueOnce(
        json({
          reviews: [
            { snippet: "Good service", rating: 5, iso_date: "2026-03-01T00:00:00Z", link: "https://r/1" },
            { snippet: "", rating: 1 }, // dropped: no text
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const { serpApiProvider } = await load();

    expect(await serpApiProvider.fetchReviews(ctx)).toEqual({
      kind: "reviews",
      url: "https://maps/acme",
      detail: "Acme HQ, 4.1/5",
      reviews: [{ text: "Good service", rating: 5, date: "2026-03-01T00:00:00Z", url: "https://r/1" }],
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=Acme+Austin");
    expect(String(fetchMock.mock.calls[1][0])).toContain("data_id=D1");
  });

  it("returns empty when no place is found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ local_results: [] })));
    const { serpApiProvider } = await load();
    expect(await serpApiProvider.fetchReviews(ctx)).toEqual({ kind: "empty" });
  });

  it("maps HTTP errors to failure reasons", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 429)));
    const { serpApiProvider } = await load();
    expect(await serpApiProvider.fetchReviews(ctx)).toMatchObject({ kind: "error", reason: "rate_limited" });
  });

  it("is disabled without a key", async () => {
    const { serpApiProvider } = await load("");
    expect(serpApiProvider.enabled()).toBe(false);
  });
});
