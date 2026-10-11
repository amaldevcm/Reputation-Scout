import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

// Runs before each test file's imports, so config.ts picks these up.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repscout-test-"));
process.env.REPSCOUT_CACHE_DIR = dir;
process.env.REPSCOUT_REPORTS_DIR = path.join(dir, "reports");
process.env.REPSCOUT_HOSTED_SEARCH = "false";
process.env.REPSCOUT_JINA_FALLBACK = "false";
process.env.REPSCOUT_PER_HOST_DELAY_MS = "0";

// Unit tests never touch the network. A test that needs HTTP stubs fetch itself.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      throw new Error(`Unexpected network call in test: ${String(url)}`);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
