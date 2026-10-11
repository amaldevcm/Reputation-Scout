import fs from "node:fs";
import path from "node:path";
import { QUOTA_FILE } from "../config.js";

type Period = "month" | "day" | "once";

interface Limit {
  period: Period;
  amount: number;
  unit: string;
}

function envNum(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(v) ? v : fallback;
}

// Defaults match each provider's published free tier; override with REPSCOUT_QUOTA_<NAME>.
function limits(): Record<string, Limit> {
  return {
    apify: { period: "month", amount: envNum("REPSCOUT_QUOTA_APIFY_USD", 5), unit: "USD" },
    brightdata: { period: "month", amount: envNum("REPSCOUT_QUOTA_BRIGHTDATA", 5000), unit: "requests" },
    tavily: { period: "month", amount: envNum("REPSCOUT_QUOTA_TAVILY", 1000), unit: "credits" },
    firecrawl: { period: "month", amount: envNum("REPSCOUT_QUOTA_FIRECRAWL", 500), unit: "credits" },
    serpapi: { period: "month", amount: envNum("REPSCOUT_QUOTA_SERPAPI", 250), unit: "searches" },
    yelp: { period: "day", amount: envNum("REPSCOUT_QUOTA_YELP", 5000), unit: "calls" },
    serper: { period: "once", amount: envNum("REPSCOUT_QUOTA_SERPER", 2500), unit: "searches" },
  };
}

interface Entry {
  period: string;
  used: number;
}

function periodKey(period: Period, now = new Date()): string {
  const iso = now.toISOString();
  return period === "month" ? iso.slice(0, 7) : period === "day" ? iso.slice(0, 10) : "once";
}

let state: Record<string, Entry> | null = null;

function load(): Record<string, Entry> {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(QUOTA_FILE, "utf-8")) as Record<string, Entry>;
  } catch {
    state = {};
  }
  return state;
}

function used(name: string, limit: Limit): number {
  const entry = load()[name];
  return entry && entry.period === periodKey(limit.period) ? entry.used : 0;
}

/** Re-reads the file on next use (tests, or after the file was edited by hand). */
export function resetQuotaCache(): void {
  state = null;
}

/** True when the provider has no known limit, or still has allowance left. */
export function hasQuota(name: string): boolean {
  const limit = limits()[name];
  return !limit || used(name, limit) < limit.amount;
}

export function quotaStatus(name: string): string | null {
  const limit = limits()[name];
  if (!limit) return null;
  return `${used(name, limit)}/${limit.amount} ${limit.unit} this ${limit.period === "once" ? "account" : limit.period}`;
}

/** Counts billed usage (only call after a successful, billed request). */
export function recordUsage(name: string, amount = 1): void {
  const limit = limits()[name];
  if (!limit) return;
  const s = load();
  s[name] = { period: periodKey(limit.period), used: used(name, limit) + amount };
  try {
    fs.mkdirSync(path.dirname(QUOTA_FILE), { recursive: true });
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(s, null, 2), "utf-8");
  } catch {
    // quota tracking is best-effort
  }
}
