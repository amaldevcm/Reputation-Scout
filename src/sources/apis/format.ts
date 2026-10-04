export function num(n: number): string {
  return n.toLocaleString("en-US");
}

export function pct(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "n/a";
}

/** "Name (count)" list of the top k entries. */
export function topList(buckets: { key: string; doc_count: number }[], k = 4): string {
  return buckets
    .slice(0, k)
    .map((b) => `${b.key} (${num(b.doc_count)})`)
    .join(", ");
}

/** YYYY-MM-DD for `daysAgo` days before now (UTC). */
export function isoDaysAgo(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

export function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit).trim()}…` : flat;
}
