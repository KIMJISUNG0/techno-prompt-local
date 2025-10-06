import { FastifyInstance } from 'fastify';
import {
  appendEvent,
  writeActive,
  writeDigest,
  writeRecords,
  today,
  isoNow,
  memPaths,
} from '../services/memory/store';
import { hydrate } from '../services/memory/retrieve';
import { syncFiles } from '../services/memory/drive';
import { MemoryEvent, MemoryRecord } from '../services/memory/types';
import path from 'node:path';

export async function registerMemoryRoutes(app: FastifyInstance) {
  app.post('/memory/event', async (req, rep) => {
    const body: any = req.body || {};
    if (!body?.kind) return rep.code(400).send({ error: { code: 'BAD_REQUEST', message: 'kind required' } });
    const evt: MemoryEvent = {
      id: `evt_${Date.now()}`,
      kind: body.kind,
      text: body.text,
      data: body.data,
      tags: body.tags,
      ts: isoNow(),
    };
    await appendEvent(evt);
    return { ok: true, id: evt.id };
  });

  app.post('/memory/records', async (req, rep) => {
    const body: any = req.body || {};
    const recs: MemoryRecord[] = Array.isArray(body?.records) ? body.records : [];
    const day = body?.day || today();
    await writeRecords(day, recs);
    return { ok: true, day, count: recs.length };
  });

  app.post('/memory/active', async (req, rep) => {
    const a: any = req.body || {};
    if (!a?.taskId || !a?.goal)
      return rep.code(400).send({ error: { code: 'BAD_REQUEST', message: 'taskId, goal required' } });
    a.updated = isoNow();
    await writeActive(a);
    return { ok: true };
  });

  app.post('/memory/digest', async (req, rep) => {
    const body: any = req.body || {};
    const day = body?.day || today();
    const summaryMd = body?.summaryMd || 'Work summary TBD.';
    const items = body?.items || [];
    await writeDigest({ day, summaryMd, items, ts: isoNow() });
    return { ok: true, day };
  });

  app.get('/memory/hydrate', async (req, rep) => {
    const q: any = req.query || {};
    const goal = q.goal || '';
    if (goal.length < 3)
      return rep.code(400).send({ error: { code: 'BAD_REQUEST', message: 'goal too short' } });
    const ctx = await hydrate(goal);
    return ctx;
  });

  app.post('/memory/sync', async () => {
    const rels = [
      memPaths.active(),
      memPaths.manifest(),
      path.join(process.env.MEMORY_ROOT || './memory', 'digests', `${today()}.md`),
    ];
    const out = await syncFiles(rels);
    return out;
  });
}
