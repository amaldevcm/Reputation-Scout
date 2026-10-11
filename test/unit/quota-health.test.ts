import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUOTA_FILE } from "../../src/config.js";
import { hasQuota, quotaStatus, recordUsage, resetQuotaCache } from "../../src/providers/quota.js";
import { coolingDown, markFailed, resetHealth } from "../../src/providers/health.js";

describe("quota tracker", () => {
  beforeEach(() => {
    fs.rmSync(QUOTA_FILE, { force: true });
    resetQuotaCache();
  });

  it("counts usage, persists it, and cuts off at the limit", () => {
    vi.stubEnv("REPSCOUT_QUOTA_SERPAPI", "2");
    expect(hasQuota("serpapi")).toBe(true);
    recordUsage("serpapi");
    recordUsage("serpapi");
    expect(hasQuota("serpapi")).toBe(false);
    expect(quotaStatus("serpapi")).toBe("2/2 searches this month");

    resetQuotaCache();
    expect(hasQuota("serpapi")).toBe(false); // read back from disk
  });

  it("resets when the period changes", () => {
    fs.mkdirSync(path.dirname(QUOTA_FILE), { recursive: true });
    fs.writeFileSync(QUOTA_FILE, JSON.stringify({ serpapi: { period: "2000-01", used: 999 } }));
    resetQuotaCache();
    expect(hasQuota("serpapi")).toBe(true);
  });

  it("treats unknown providers as unlimited", () => {
    recordUsage("nobody");
    expect(hasQuota("nobody")).toBe(true);
    expect(quotaStatus("nobody")).toBeNull();
  });
});

describe("circuit breaker", () => {
  beforeEach(() => resetHealth());
  afterEach(() => vi.useRealTimers());

  it("skips a failed provider until its cooldown ends", () => {
    vi.useFakeTimers();
    markFailed("p", "rate_limited", "HTTP 429");
    expect(coolingDown("p")).toBe("HTTP 429");
    vi.advanceTimersByTime(61_000);
    expect(coolingDown("p")).toBeNull();

    markFailed("p", "bot_blocked", "403");
    vi.advanceTimersByTime(61_000);
    expect(coolingDown("p")).toBe("403"); // bot blocks cool down longer
  });
});
