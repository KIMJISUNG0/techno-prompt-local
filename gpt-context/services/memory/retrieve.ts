import fs from 'node:fs/promises';
import path from 'node:path';
import { ActiveTask, HydratedContext, KnowledgeCard, MemoryRecord, RegressionNote } from './types';
import { memPaths } from './store';

function score(text: string, query: string, mtime: number, tauDays: number) {
  const qs = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
  const ws = text.toLowerCase().split(/\W+/);
  let overlap = 0;
  for (const w of ws) if (qs.has(w)) overlap++;
  const days = (Date.now() - mtime) / (86400 * 1000);
  const recency = Math.exp(-days / (tauDays || 7));
  return overlap + 0.5 * recency;
}

export async function hydrate(goal: string): Promise<HydratedContext> {
  const tau = Number(process.env.MEMORY_RECENCY_TAU_D || 7);
  const maxCtx = Number(process.env.MEMORY_MAX_CTX || 1800);

  const active = await (async () => {
    try {
      const s = await fs.readFile(memPaths.active(), 'utf8');
      return JSON.parse(s) as ActiveTask;
    } catch {
      return undefined;
    }
  })();

  const cardsDir = path.dirname(memPaths.cards('dummy'));
  await fs.mkdir(cardsDir, { recursive: true });
  const cardFiles = (await fs.readdir(cardsDir)).filter((f) => f.endsWith('.md'));
  const cards: KnowledgeCard[] = [];
  for (const f of cardFiles) {
    const full = path.join(cardsDir, f);
    const st = await fs.stat(full);
    const bodyMd = await fs.readFile(full, 'utf8');
    cards.push({ id: f.replace(/\.md$/, ''), title: f, tags: [], bodyMd, ts: st.mtime.toISOString() });
  }

  const regDir = path.dirname(memPaths.regressions('dummy'));
  await fs.mkdir(regDir, { recursive: true });
  const regFiles = (await fs.readdir(regDir)).filter((f) => f.endsWith('.md'));
  const regs: RegressionNote[] = [];
  for (const f of regFiles) {
    const full = path.join(regDir, f);
    const st = await fs.stat(full);
    regs.push({ id: f.replace(/\.md$/, ''), tags: [], bodyMd: await fs.readFile(full, 'utf8'), ts: st.mtime.toISOString() });
  }

  const recDir = path.dirname(memPaths.recordsDay('dummy'));
  await fs.mkdir(recDir, { recursive: true });
  const dayFiles = (await fs.readdir(recDir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, 10);
  const decisions: MemoryRecord[] = [];
  for (const f of dayFiles) {
    const full = path.join(recDir, f);
    const obj = JSON.parse(await fs.readFile(full, 'utf8'));
    const only = (obj.records || []).filter((r: any) => r?.phase === 'decision');
    decisions.push(...only);
  }

  const scoredCards = await Promise.all(
    cards.map(async (c) => {
      const st = await fs.stat(path.join(cardsDir, c.id + '.md'));
      return { c, s: score(c.bodyMd, goal, st.mtimeMs, tau) };
    })
  );
  const scoredRegs = await Promise.all(
    regs.map(async (r) => {
      const st = await fs.stat(path.join(regDir, r.id + '.md'));
      return { r, s: score(r.bodyMd, goal, st.mtimeMs, tau) };
    })
  );
  scoredCards.sort((a, b) => b.s - a.s);
  scoredRegs.sort((a, b) => b.s - a.s);

  const pickCards: KnowledgeCard[] = [];
  const pickRegs: RegressionNote[] = [];
  let budget = maxCtx;
  for (const { c } of scoredCards) {
    const len = c.bodyMd.length / 3;
    if (budget - len < 300) break;
    pickCards.push(c);
    budget -= len;
  }
  for (const { r } of scoredRegs) {
    const len = r.bodyMd.length / 3;
    if (budget - len < 200) break;
    pickRegs.push(r);
    budget -= len;
  }

  return { active, cards: pickCards, regressions: pickRegs, decisions };
}
