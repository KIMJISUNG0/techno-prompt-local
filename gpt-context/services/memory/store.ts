import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ActiveTask, Digest, MemoryEvent, MemoryRecord, Manifest } from './types';

const ROOT = process.env.MEMORY_ROOT || './memory';
const p = (...xs: string[]) => path.join(ROOT, ...xs);

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function appendJsonl(file: string, obj: any) {
  await ensureDir(path.dirname(file));
  await fs.appendFile(file, JSON.stringify(obj) + '\n', 'utf8');
}

async function writeJson(file: string, obj: any) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(obj, null, 2), 'utf8');
}
async function writeText(file: string, text: string) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, text, 'utf8');
}

export const memPaths = {
  rawDay: (day: string) => p('raw', day, 'events.jsonl'),
  recordsDay: (day: string) => p('records', day, 'records.json'),
  digestsDay: (day: string) => p('digests', `${day}.md`),
  cards: (slug: string) => p('cards', `${slug}.md`),
  regressions: (id: string) => p('regressions', `${id}.md`),
  active: () => p('active', 'current-task.json'),
  manifest: () => p('manifest', 'index.json'),
};

export function today() {
  return new Date().toISOString().slice(0, 10);
}
export function isoNow(): string {
  return new Date().toISOString();
}

export async function appendEvent(evt: MemoryEvent) {
  await appendJsonl(memPaths.rawDay(evt.ts.slice(0, 10)), evt);
}

export async function writeRecords(day: string, records: MemoryRecord[]) {
  await writeJson(memPaths.recordsDay(day), { day, records });
}

export async function writeDigest(d: Digest) {
  const header = `# Digest ${d.day}\n\n- Generated: ${d.ts}\n\n`;
  const items = d.items
    .map((i) => `- ${i.kind} \`${i.id}\`${i.title ? ` — ${i.title}` : ''}`)
    .join('\n');
  await writeText(memPaths.digestsDay(d.day), header + d.summaryMd + '\n\n## Items\n' + items + '\n');
}

export async function writeActive(a: ActiveTask) {
  await writeJson(memPaths.active(), a);
}

export async function readActive(): Promise<ActiveTask | undefined> {
  try {
    const s = await fs.readFile(memPaths.active(), 'utf8');
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

export async function ensureManifest(): Promise<Manifest> {
  try {
    const s = await fs.readFile(memPaths.manifest(), 'utf8');
    return JSON.parse(s);
  } catch {
    const m: Manifest = { version: 1, updated: isoNow(), files: {} };
    await writeJson(memPaths.manifest(), m);
    return m;
  }
}

export async function hashFile(file: string): Promise<string> {
  const buf = await fs.readFile(file);
  return crypto.createHash('sha256').update(buf).digest('hex');
}
