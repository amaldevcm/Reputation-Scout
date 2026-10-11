import { beforeEach, describe, expect, it, vi } from "vitest";
import { runChain } from "../../src/pipeline/runChain.js";
import { newManifest } from "../../src/pipeline/manifest.js";
import { resetHealth } from "../../src/providers/health.js";
import type { ProviderOutcome, ReviewProvider } from "../../src/providers/types.js";

let n = 0;
function manifest() {
  // A fresh company per test keeps the per-provider result cache from leaking between tests.
  return newManifest(`Test Co ${++n}`, ["glassdoor"], { domain: "testco.com" });
}

function provider(name: string, outcome: ProviderOutcome | (() => never), enabled = true): ReviewProvider {
  return {
    name,
    enabled: () => enabled,
    fetchReviews: vi.fn(async () => (typeof outcome === "function" ? outcome() : outcome)),
  };
}

const page = (name: string) => provider(name, { kind: "pages", pages: [{ url: "https://p/1", markdown: "text" }] });

describe("runChain", () => {
  beforeEach(() => resetHealth());

  it("returns false and leaves the manifest alone when nothing is enabled", async () => {
    const m = manifest();
    const before = structuredClone(m.sources.glassdoor);
    expect(await runChain(m, "glassdoor", [provider("a", { kind: "empty" }, false)])).toBe(false);
    expect(m.sources.glassdoor).toEqual(before);
  });

  it("falls through errors and empties to the first usable provider", async () => {
    const m = manifest();
    const later = provider("c", { kind: "empty" });
    const chain = [
      provider("a", { kind: "error", reason: "bot_blocked", message: "HTTP 403" }),
      provider("b", { kind: "empty" }),
      provider("ok", {
        kind: "reviews",
        url: "https://example.com/r",
        reviews: [
          { text: "Great place, mail me at x@y.com", rating: 5, date: "2026-01-02T00:00:00Z" },
          { text: "Meh", rating: 3 },
        ],
      }),
      later,
    ];

    expect(await runChain(m, "glassdoor", chain)).toBe(true);
    const s = m.sources.glassdoor;
    expect(s.status).toBe("done");
    expect(s.provider).toBe("ok");
    expect(s.detail).toContain("earlier: a: HTTP 403; b: no content");
    expect(s.findings[0].text).toContain("2 glassdoor reviews, average 4.0/5");
    expect(s.findings[0].text).toContain("[redacted-email]");
    expect(s.matchedPages[0]).toMatchObject({ url: "https://example.com/r", confidence: "high" });
    expect(later.fetchReviews).not.toHaveBeenCalled();
  });

  it("records page content as findings", async () => {
    const m = manifest();
    await runChain(m, "glassdoor", [page("reader")]);
    expect(m.sources.glassdoor.findings).toEqual([{ url: "https://p/1", text: "text", redacted: true }]);
  });

  it("marks the source blocked when providers were bot-blocked", async () => {
    const m = manifest();
    await runChain(m, "glassdoor", [provider("a", { kind: "error", reason: "bot_blocked", message: "403" })]);
    expect(m.sources.glassdoor).toMatchObject({ status: "blocked", reason: "bot_blocked" });
  });

  it("marks the source failed and counts an attempt on other errors", async () => {
    const m = manifest();
    await runChain(m, "glassdoor", [provider("a", { kind: "error", reason: "service_down", message: "down" })]);
    expect(m.sources.glassdoor).toMatchObject({ status: "failed", reason: "service_down", attempts: 1 });
  });

  it("reports no_results when a provider looked and found nothing", async () => {
    const m = manifest();
    await runChain(m, "glassdoor", [
      provider("a", { kind: "error", reason: "service_down", message: "down" }),
      provider("b", { kind: "empty" }),
    ]);
    expect(m.sources.glassdoor.status).toBe("no_results");
  });

  it("treats a thrown provider as an error and moves on", async () => {
    const m = manifest();
    const boom = provider("boom", () => {
      throw new Error("kaboom");
    });
    await runChain(m, "glassdoor", [boom, page("ok")]);
    expect(m.sources.glassdoor.provider).toBe("ok");
  });

  it("skips a provider that failed recently", async () => {
    const flaky = provider("flaky", { kind: "error", reason: "rate_limited", message: "429" });
    await runChain(manifest(), "glassdoor", [flaky]);
    const m = manifest();
    await runChain(m, "glassdoor", [flaky, page("ok")]);
    expect(flaky.fetchReviews).toHaveBeenCalledTimes(1);
    expect(m.sources.glassdoor.detail).toContain("flaky: skipped, failed recently");
  });

  it("serves a repeat run from cache without calling the provider again", async () => {
    const m = manifest();
    const p = page("ok");
    await runChain(m, "glassdoor", [p]);
    await runChain(m, "glassdoor", [p]);
    expect(p.fetchReviews).toHaveBeenCalledTimes(1);
    expect(m.sources.glassdoor.detail).toContain("(cached)");
  });

  it("caps reviews at MAX_REVIEWS_PER_SOURCE", async () => {
    const m = manifest();
    const reviews = Array.from({ length: 50 }, (_, i) => ({ text: `r${i}` }));
    await runChain(m, "glassdoor", [provider("ok", { kind: "reviews", reviews, url: "u" })]);
    expect(m.sources.glassdoor.findings[0].text).toMatch(/^30 glassdoor reviews:/);
  });
});
