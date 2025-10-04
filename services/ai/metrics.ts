// Lightweight in-memory metrics collection for AI engine calls.
// Not persistent; pruned on read (24h window).
export interface MetricEntry {
  ts: number; // epoch ms
  engine: string;
  phase: string; // draft|critique|revise|other
  ms: number;
  ok: boolean;
  err?: string;
}

const ENTRIES: MetricEntry[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

function prune(now = Date.now()) {
  // Keep only last 24h
  for (let i = ENTRIES.length - 1; i >= 0; i--) {
    if (now - ENTRIES[i].ts > DAY_MS) {
      ENTRIES.splice(i, 1);
    }
  }
}

export async function withMetrics<T>(engine: string, phase: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const out = await fn();
    ENTRIES.push({ ts: start, engine, phase, ms: Date.now() - start, ok: true });
    prune();
    return out;
  } catch (e: any) {
    ENTRIES.push({ ts: start, engine, phase, ms: Date.now() - start, ok: false, err: e?.message || String(e) });
    prune();
    throw e;
  }
}

export function getUsageRaw(minutes = 60): MetricEntry[] {
  const cutoff = Date.now() - minutes * 60 * 1000;
  prune();
  return ENTRIES.filter((e) => e.ts >= cutoff).slice(-5000); // cap
}

export interface MetricSummaryRow {
  engine: string;
  phase: string;
  count: number;
  ok: number;
  fail: number;
  p50: number;
  p95: number;
  avgMs: number;
}

export function getMetricsSummary(): MetricSummaryRow[] {
  prune();
  const groups = new Map<string, MetricEntry[]>();
  for (const e of ENTRIES) {
    const key = `${e.engine}::${e.phase}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const rows: MetricSummaryRow[] = [];
  for (const [key, arr] of groups) {
    arr.sort((a, b) => a.ms - b.ms);
    const p = (q: number) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))].ms;
    const [engine, phase] = key.split('::');
    const ok = arr.filter((x) => x.ok).length;
    const fail = arr.length - ok;
    rows.push({
      engine,
      phase,
      count: arr.length,
      ok,
      fail,
      p50: p(0.5),
      p95: p(0.95),
      avgMs: arr.reduce((s, x) => s + x.ms, 0) / arr.length,
    });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows;
}
