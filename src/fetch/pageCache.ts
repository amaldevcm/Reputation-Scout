import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PAGE_CACHE_DIR, CACHE_TTL_MS } from "../config.js";

interface CacheEntry {
  url: string;
  fetchedAt: string;
  body: string;
}

function keyFor(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex");
}

function entryPath(url: string): string {
  return path.join(PAGE_CACHE_DIR, `${keyFor(url)}.json`);
}

export async function getCached(url: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(entryPath(url), "utf-8");
    const entry = JSON.parse(raw) as CacheEntry;
    const age = Date.now() - new Date(entry.fetchedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return entry.body;
  } catch {
    return null;
  }
}

export async function setCached(url: string, body: string): Promise<void> {
  await fs.mkdir(PAGE_CACHE_DIR, { recursive: true });
  const entry: CacheEntry = { url, fetchedAt: new Date().toISOString(), body };
  await fs.writeFile(entryPath(url), JSON.stringify(entry), "utf-8");
}
