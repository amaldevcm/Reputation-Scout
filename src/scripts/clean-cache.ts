#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { PAGE_CACHE_DIR, CACHE_TTL_MS } from "../lib/config.js";

async function main() {
  let entries: string[];
  try {
    entries = await fs.readdir(PAGE_CACHE_DIR);
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      console.log("No page cache directory found; nothing to clean.");
      return;
    }
    throw err;
  }

  let removed = 0;
  for (const entry of entries) {
    const filePath = path.join(PAGE_CACHE_DIR, entry);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as { fetchedAt: string };
      const age = Date.now() - new Date(parsed.fetchedAt).getTime();
      if (age > CACHE_TTL_MS) {
        await fs.unlink(filePath);
        removed++;
      }
    } catch {
      // malformed cache entry; remove it too
      await fs.unlink(filePath).catch(() => {});
      removed++;
    }
  }

  console.log(`Removed ${removed} expired cache entr${removed === 1 ? "y" : "ies"} of ${entries.length}.`);
}

main().catch((err) => {
  console.error("clean-cache failed:", err);
  process.exit(1);
});
