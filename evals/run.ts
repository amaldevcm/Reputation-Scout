/**
 * Live eval: runs research_company against a fixed benchmark set and scores
 * how many sources each run actually covered, which provider served them, and
 * whether known facts (evals/companies.json `expect`) held. Makes real network
 * calls and spends free-tier quota, so it is never part of `npm test`.
 *
 *   npm run eval                       all companies, fresh cache
 *   npm run eval -- --only stripe      companies whose name contains "stripe"
 *   npm run eval -- --sources g2,bbb   limit the sources checked
 *   npm run eval -- --use-cache        reuse the normal cache (no new calls for cached pages)
 *   npm run eval -- --save-baseline    also write the result as the new baseline
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

// Isolate the run before config.ts is loaded, so cached pages and old manifests don't flatter the numbers.
if (!flag("use-cache")) {
  process.env.REPSCOUT_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "repscout-eval-"));
}

const { researchCompany } = await import("../src/tools/researchCompany.js");
const { loadManifest } = await import("../src/pipeline/manifest.js");
const { DEFAULT_SOURCES } = await import("../src/types.js");

interface Company {
  name: string;
  domain?: string;
  location?: string;
  industry_hint?: string;
  expect?: Record<string, string>;
}

interface SourceResult {
  status: string;
  provider?: string;
  reason?: string;
  findings: number;
  chars: number;
}

interface CompanyResult {
  name: string;
  ms: number;
  error?: string;
  sources: Record<string, SourceResult>;
  checks: { source: string; expected: string; actual: string; pass: boolean }[];
}

const { companies } = JSON.parse(fs.readFileSync(path.join(here, "companies.json"), "utf-8")) as {
  companies: Company[];
};
const only = option("only")?.toLowerCase();
const sources = option("sources")?.split(",") ?? [...DEFAULT_SOURCES];
const selected = companies.filter((c) => !only || c.name.toLowerCase().includes(only));

const results: CompanyResult[] = [];
for (const company of selected) {
  process.stdout.write(`${company.name} … `);
  const started = Date.now();
  const result: CompanyResult = { name: company.name, ms: 0, sources: {}, checks: [] };
  try {
    await researchCompany({
      company_name: company.name,
      domain: company.domain,
      location: company.location,
      industry_hint: company.industry_hint,
      sources,
      restart: true,
    });
    const manifest = await loadManifest(company.name);
    for (const [name, s] of Object.entries(manifest?.sources ?? {})) {
      result.sources[name] = {
        status: s.status,
        provider: s.provider,
        reason: s.reason,
        findings: s.findings.length,
        chars: s.findings.reduce((n, f) => n + f.text.length, 0),
      };
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  result.ms = Date.now() - started;

  for (const [source, expected] of Object.entries(company.expect ?? {})) {
    if (!sources.includes(source)) continue;
    const actual = result.sources[source]?.status ?? "missing";
    const pass = expected === "found" ? actual === "done" : actual === expected;
    result.checks.push({ source, expected, actual, pass });
  }
  results.push(result);
  console.log(result.error ? `error: ${result.error}` : `${(result.ms / 1000).toFixed(0)}s`);
}

// ---- Scoring ---------------------------------------------------------------

const all = results.flatMap((r) => Object.entries(r.sources).map(([source, s]) => ({ source, ...s })));
const applicable = all.filter((s) => s.status !== "not_applicable");
const done = applicable.filter((s) => s.status === "done");
const checks = results.flatMap((r) => r.checks);

const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${Math.round((a / b) * 100)}%`);

const bySource: Record<string, { done: number; total: number; statuses: Record<string, number> }> = {};
for (const s of applicable) {
  const row = (bySource[s.source] ??= { done: 0, total: 0, statuses: {} });
  row.total++;
  if (s.status === "done") row.done++;
  row.statuses[s.status] = (row.statuses[s.status] ?? 0) + 1;
}

const byProvider: Record<string, number> = {};
for (const s of done) byProvider[s.provider ?? "(direct/api)"] = (byProvider[s.provider ?? "(direct/api)"] ?? 0) + 1;

const summary = {
  coverage: done.length / Math.max(1, applicable.length),
  checksPassed: checks.filter((c) => c.pass).length,
  checksTotal: checks.length,
  avgSeconds: results.reduce((n, r) => n + r.ms, 0) / Math.max(1, results.length) / 1000,
};

console.log("\n## Summary");
console.log(`Coverage (done / applicable sources): ${pct(done.length, applicable.length)}`);
console.log(`Expectation checks passed:            ${summary.checksPassed}/${summary.checksTotal}`);
console.log(`Average time per company:             ${summary.avgSeconds.toFixed(0)}s`);

console.log("\n## By source");
for (const [source, row] of Object.entries(bySource).sort((a, b) => a[1].done / a[1].total - b[1].done / b[1].total)) {
  const statuses = Object.entries(row.statuses).map(([k, v]) => `${k}:${v}`).join(" ");
  console.log(`${source.padEnd(16)} ${pct(row.done, row.total).padStart(4)}  ${statuses}`);
}

console.log("\n## Served by provider");
for (const [provider, count] of Object.entries(byProvider).sort((a, b) => b[1] - a[1])) {
  console.log(`${provider.padEnd(16)} ${count}`);
}

const failed = checks.filter((c) => !c.pass);
if (failed.length) {
  console.log("\n## Failed checks");
  for (const r of results) {
    for (const c of r.checks.filter((c) => !c.pass)) {
      console.log(`${r.name}: ${c.source} expected ${c.expected}, got ${c.actual}`);
    }
  }
}

// ---- Baseline comparison ---------------------------------------------------

const resultsDir = path.join(here, "results");
const baselinePath = path.join(here, "baseline.json");
fs.mkdirSync(resultsDir, { recursive: true });
const out = { at: new Date().toISOString(), sources, summary, bySource, byProvider, results };
const outPath = path.join(resultsDir, `${out.at.replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\nWrote ${path.relative(process.cwd(), outPath)}`);

let regressed = false;
if (fs.existsSync(baselinePath)) {
  const base = JSON.parse(fs.readFileSync(baselinePath, "utf-8")) as typeof out;
  console.log("\n## Against baseline");
  const delta = (summary.coverage - base.summary.coverage) * 100;
  console.log(`Coverage: ${(base.summary.coverage * 100).toFixed(0)}% -> ${(summary.coverage * 100).toFixed(0)}% (${delta >= 0 ? "+" : ""}${delta.toFixed(0)} pts)`);
  for (const [source, row] of Object.entries(bySource)) {
    const before = base.bySource[source];
    if (before && row.done / row.total < before.done / before.total) {
      console.log(`  regressed: ${source} ${pct(before.done, before.total)} -> ${pct(row.done, row.total)}`);
      regressed = true;
    }
  }
  // Network results are noisy; only a drop of more than 10 points fails the run.
  if (delta < -10) regressed = true;
}

if (flag("save-baseline")) {
  fs.writeFileSync(baselinePath, JSON.stringify(out, null, 2));
  console.log(`Saved baseline to ${path.relative(process.cwd(), baselinePath)}`);
}

process.exitCode = failed.length > 0 || regressed ? 1 : 0;
