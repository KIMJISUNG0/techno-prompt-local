// Offline prompt queue utilities for serverless workflow
// Stored in localStorage under a single key. Lightweight, append / replace by hash.

export interface OfflinePrompt {
  hash: string;
  ts: string; // ISO timestamp
  bpm: number;
  mode: 'short' | 'long';
  text: string;
  filenamePrefix: string;
  version?: number;
  arrangementMode?: string;
  lengthChars?: number;
}

const KEY = 'funkPromptQueueV1';

function safeParse<T>(raw: string|null, fallback: T): T {
  if(!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function loadQueue(): OfflinePrompt[] {
  if (typeof window === 'undefined') return [];
  return safeParse<OfflinePrompt[]>(localStorage.getItem(KEY), []);
}

export function saveQueue(list: OfflinePrompt[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function upsertPrompt(p: OfflinePrompt): { updated: boolean; list: OfflinePrompt[] } {
  const list = loadQueue();
  const idx = list.findIndex(x => x.hash === p.hash);
  if (idx >= 0) list[idx] = p; else list.push(p);
  saveQueue(list);
  return { updated: idx >= 0, list };
}

export function clearQueue() {
  saveQueue([]);
}

export function exportAsJsonl(list?: OfflinePrompt[]): string {
  const data = list || loadQueue();
  return data.map(o => JSON.stringify(o)).join('\n');
}

export function removeHash(hash: string) {
  const list = loadQueue().filter(x => x.hash !== hash);
  saveQueue(list);
}

export function queueStats() {
  const list = loadQueue();
  const latestTs = list.length ? list[list.length - 1].ts : undefined;
  return { size: list.length, latestTs };
}
