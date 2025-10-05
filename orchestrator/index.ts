// Attempt to load environment variables.
// 1) Try dotenv (if installed). 2) Fallback to manual .env parsing (no extra install needed).
import fs from 'node:fs';
import path from 'node:path';
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
} catch {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        if (!(k in process.env)) process.env[k] = v;
      }
    }
  } catch {}
}
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import Redis from 'ioredis';
import { normalizeTask, Task } from './task-schema';
import 'node:crypto';
import { runWorkflow } from '../services/workflow';
import { runModelCouncil } from '../services/model-council';
import { runEnsemble } from '../services/ensemble';
import { registerMemoryRoutes } from './memory-routes';
import { registerDevCouncilRoutes } from './dev-council-routes';
import { registerMetricsRoutes } from './metrics-routes';
import { registerMusicNaturalRoutes } from '../services/music/routes-natural';
import { isMockEnabled } from '../services/ai-mock';
import { applyPatches } from '../services/apply-patches';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const queueKey = process.env.QUEUE_KEY || 'tasks:pending';

let redis: Redis | null = null;
const allowNoRedis = process.env.ORCH_ALLOW_NO_REDIS === '1';
// Only attempt Redis connection if we are NOT explicitly in memory-only mode.
if (!allowNoRedis) {
  try {
    // Limit retry noise: after 3 failed attempts stop retrying (ioredis default would keep going)
    const retryStrategy = (times: number) => {
      if (times > 3) return null; // stop
      return Math.min(200 * times, 1000);
    };
    redis = new Redis(redisUrl, { retryStrategy });
    let redisErrorLogged = false;
    redis.on('error', (e) => {
      if (!allowNoRedis && !redisErrorLogged) {
        redisErrorLogged = true;
        // Downgrade to warn for cleaner logs if running without external Redis provisioned
        app.log.warn({ err: e }, 'Redis connection error (logging once; continuing in memory)');
      }
    });
  } catch (e) {
    if (!allowNoRedis) throw e; // rethrow only if not allowed to skip redis
  }
}

// In-memory fallback queue (dev only)
const memQueue: Task[] = [];
const memResults: Record<string, any> = {};
const app: FastifyInstance = Fastify({ logger: true });

async function bootstrap() {
  await app.register(cors, { origin: '*', methods: ['GET','POST','OPTIONS'], credentials: false });
  // Simple custom rate limiter (token bucket per ip+route) to avoid fastify v5 plugin requirement
  const buckets: Record<string, { tokens: number; updated: number }> = {};
  const LIMIT_DEFAULT = 60; // per minute
  const LIMIT_HIGH = 120; // for /health and /dev-council/stream
  function allow(ip: string, route: string) {
    const key = ip + '|' + route;
    const now = Date.now();
    const cap = route === '/health' || route.startsWith('/dev-council/stream') ? LIMIT_HIGH : LIMIT_DEFAULT;
    const refillRate = cap / 60000; // tokens per ms
    if (!buckets[key]) buckets[key] = { tokens: cap, updated: now };
    const b = buckets[key];
    const delta = now - b.updated;
    b.tokens = Math.min(cap, b.tokens + delta * refillRate);
    b.updated = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    return false;
  }
  app.addHook('onRequest', (req, reply, done) => {
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/[^0-9a-fA-F:.]/g, '');
    if (!allow(ip, req.routerPath || req.url)) {
      reply.code(429).send({ error: 'rate_limited' });
      return;
    }
    done();
  });

// (선택) Private Network Access 대응 헤더 — 일부 브라우저/환경에서 필요
app.addHook('onSend', async (req, reply, payload) => {
  reply.header('Access-Control-Allow-Private-Network', 'true');
  return payload;
});

  if (allowNoRedis) {
    app.log.info('ORCH_ALLOW_NO_REDIS=1 -> Using in-memory queue & cache (Redis disabled)');
  }

  // Memory system routes
  await registerMemoryRoutes(app);
  await registerDevCouncilRoutes(app);
  await registerMetricsRoutes(app);
  registerMusicNaturalRoutes(app);
  // Lightweight lab prompt logging endpoint (mirrors scripts/log-prompt.ts logic)
  app.post('/lab/prompt-log', async (req, reply) => {
    try {
      const body: any = req.body || {};
      const text: string = body.text;
      const bpm: number = Number(body.bpm);
      const mode: string = body.mode === 'long' ? 'long' : 'short';
      if(!text || !text.trim()) { reply.code(400); return { error: 'missing text' }; }
      if(!bpm || !Number.isFinite(bpm)) { reply.code(400); return { error: 'invalid bpm' }; }
      const { createHash } = await import('node:crypto');
      const hash = createHash('sha1').update(text,'utf8').digest('hex').slice(0,8);
      const ts = new Date().toISOString();
      const rec = { ts, mode, bpm, hash, length: text.length, text, version: 1 };
      const path = await import('node:path');
      const fs = await import('node:fs');
      const dir = path.join(process.cwd(),'memory','records');
      if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
      const file = path.join(dir,'prompts.jsonl');
      fs.appendFileSync(file, JSON.stringify(rec)+'\n','utf8');
      const filenamePrefix = ts.replace(/[-:]/g,'').replace(/\..+/,'Z')+`__${mode}__${hash}__${bpm}bpm`;
      return { ok:true, hash, filenamePrefix, record: rec };
    } catch (e:any) {
      reply.code(500); return { error: e.message };
    }
  });

  // Lightweight ping for front-end multi-endpoint fallback detection
  app.get('/lab/prompt-log/ping', async (_req, _rep) => {
    return { ok: true, service: 'orchestrator', route: '/lab/prompt-log' };
  });

  // Simple per-request timing log
  app.addHook('onRequest', (req, _reply, done) => {
    (req as any)._start = process.hrtime.bigint();
    done();
  });
  app.addHook('onResponse', (req, reply, done) => {
    try {
      const start = (req as any)._start as bigint | undefined;
      const ms = start ? Number((process.hrtime.bigint() - start) / BigInt(1_000_000)) : 0;
      app.log.info({ method: req.method, url: req.url, status: reply.statusCode, ms }, 'req');
    } catch {}
    done();
  });

app.get('/health', async () => ({ ok: true }));
// Simple root route to avoid 404 confusion on GET /
app.get('/', async () => ({
  ok: true,
  service: 'orchestrator',
  memoryMode: allowNoRedis || !redis ? 'in-memory' : 'redis',
  tips: 'Use /health, /music/presets-natural, /music/prompt-natural'
}));

app.get('/ai-status', async () => {
  const openaiKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '';
  const geminiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '';
  const mock = isMockEnabled();
  return {
    openai: {
      hasKey: openaiKey,
      workflowModel: process.env.WORKFLOW_GPT_MODEL || 'gpt-4.1',
      council: {
        architect: process.env.COUNCIL_ARCH_MODEL || 'gpt-4.1-mini',
        implement: process.env.COUNCIL_IMPL_MODEL || 'gpt-4.1-mini',
        refine: process.env.COUNCIL_REFINE_MODEL || 'gpt-4.1'
      }
    },
    gemini: {
      hasKey: geminiKey,
      workflowModel: process.env.WORKFLOW_GEMINI_MODEL || 'gemini-1.5-pro',
      council: {
        requirements: process.env.COUNCIL_REQ_MODEL || 'gemini-1.5-flash',
        review: process.env.COUNCIL_REVIEW_MODEL || process.env.COUNCIL_REQ_MODEL || 'gemini-1.5-flash'
      }
    },
    mock: {
      enabled: mock,
      note: mock ? 'One or more provider keys missing -> mock fallback active' : 'mock disabled'
    }
  };
});

interface EnqueueBody {
  type: Task['type'];
  prompt: string;
  params?: Record<string, unknown>;
  id?: string;
}

app.post<{ Body: EnqueueBody }>('/enqueue', async (req: FastifyRequest<{ Body: EnqueueBody }>, reply: FastifyReply) => {
  try {
    const task = normalizeTask(req.body);
    if (redis && redis.status === 'ready') {
      await redis.lpush(queueKey, JSON.stringify(task));
    } else if (allowNoRedis) {
      memQueue.unshift(task);
    } else {
      throw new Error('Redis not available');
    }
    reply.code(202);
    return { enqueued: true, task };
  } catch (err: any) {
    req.log.error({ err }, 'enqueue failed');
    reply.code(400);
    return { error: err.message, issues: err.issues };
  }
});

app.get('/peek', async () => {
  if (redis && redis.status === 'ready') {
    const raw = await redis.lrange(queueKey, -1, -1);
    if (!raw.length) return { task: null };
    return { task: JSON.parse(raw[0]) as Task };
  }
  if (allowNoRedis) {
    return { task: memQueue[memQueue.length - 1] || null };
  }
  return { task: null };
});

app.get('/stats', async () => {
  if (redis && redis.status === 'ready') {
    const len = await redis.llen(queueKey);
    return { queue: queueKey, length: len, backend: 'redis' };
  }
  return { queue: queueKey, length: memQueue.length, backend: allowNoRedis ? 'memory' : 'unavailable' };
});

app.get('/results/:id', async (req, reply) => {
  const id = (req.params as any).id as string;
  if (!id) return reply.code(400).send({ error: 'missing id' });
  if (redis && redis.status === 'ready') {
    const key = `${process.env.PROCESSED_KEY || 'tasks:processed'}:${id}`;
    const data = await redis.hgetall(key);
    if (!data || Object.keys(data).length === 0) return reply.code(404).send({ error: 'not found' });
    return { id, data, backend: 'redis' };
  }
  if (allowNoRedis) {
    const data = memResults[id];
    if (!data) return reply.code(404).send({ error: 'not found' });
    return { id, data, backend: 'memory' };
  }
  return reply.code(503).send({ error: 'results backend unavailable' });
});

app.post('/workflow', async (req, reply) => {
  const body = req.body as any;
  if (!body?.prompt) {
    reply.code(400);
    return { error: 'missing prompt' };
  }
  try {
    const result = await runWorkflow(body.prompt);
    return result;
  } catch (e: any) {
    req.log.error({ err: e }, 'workflow failed');
    reply.code(500);
    return { error: e.message };
  }
});

// Convenience GET (browser quick test): /workflow?prompt=...
app.get('/workflow', async (req, reply) => {
  const prompt = (req.query as any)?.prompt;
  if (!prompt) {
    return { usage: 'Provide ?prompt=...  (POST /workflow {"prompt":"..."} is canonical)' };
  }
  try {
    const result = await runWorkflow(prompt as string);
    return result;
  } catch (e: any) {
    reply.code(500);
    return { error: e.message };
  }
});

app.post('/council', async (req, reply) => {
  const body = req.body as any;
  if (!body?.prompt) {
    reply.code(400);
    return { error: 'missing prompt' };
  }
  try {
    const result = await runModelCouncil({ userPrompt: body.prompt });
    return result;
  } catch (e: any) {
    req.log.error({ err: e }, 'council failed');
    reply.code(500);
    return { error: e.message };
  }
});

app.get('/council', async (req, reply) => {
  const prompt = (req.query as any)?.prompt;
  if (!prompt) {
    return { usage: 'Provide ?prompt=...  (POST /council {"prompt":"..."} is canonical)' };
  }
  try {
    const result = await runModelCouncil({ userPrompt: prompt as string });
    return result;
  } catch (e: any) {
    reply.code(500);
    return { error: e.message };
  }
});

// Auto council: run council and immediately apply any patches (allowlist protected)
// POST /auto-council { prompt, commit? }  (commit not yet implemented)
app.post('/auto-council', async (req, reply) => {
  const body = req.body as any;
  if (!body?.prompt) { reply.code(400); return { error: 'missing prompt' }; }
  try {
    const council = await runModelCouncil({ userPrompt: body.prompt });
    const applied = applyPatches(council.proposedPatches);
    return { council, applied };
  } catch (e: any) {
    reply.code(500); return { error: e.message };
  }
});

app.get('/auto-council', async (req, reply) => {
  const q: any = req.query || {};
  const prompt = q.prompt;
  if (!prompt) return { usage: 'Provide ?prompt=...  (POST /auto-council {"prompt":"..."} applies patches)' };
  try {
    const council = await runModelCouncil({ userPrompt: prompt });
    const applied = applyPatches(council.proposedPatches);
    return { council, applied };
  } catch (e: any) {
    reply.code(500); return { error: e.message };
  }
});

app.post('/ensemble', async (req, reply) => {
  const body = req.body as any;
  if (!body?.prompt) {
    reply.code(400);
    return { error: 'missing prompt' };
  }
  try {
    const result = await runEnsemble({
      prompt: body.prompt,
      creativeVariants: body.creativeVariants,
      highTemperature: body.highTemperature,
      cache: body.cache
    });
    return result;
  } catch (e: any) {
    req.log.error({ err: e }, 'ensemble failed');
    reply.code(500);
    return { error: e.message };
  }
});

app.get('/ensemble', async (req, reply) => {
  const q: any = req.query || {};
  const prompt = q.prompt;
  if (!prompt) {
    return { usage: 'Provide ?prompt=...  (POST /ensemble {"prompt":"..."} allows variants/highTemperature)' };
  }
  try {
    const result = await runEnsemble({
      prompt: prompt as string,
      creativeVariants: q.creativeVariants ? Number(q.creativeVariants) : undefined,
      highTemperature: q.highTemperature ? Number(q.highTemperature) : undefined,
      cache: q.cache === '1' ? true : q.cache === '0' ? false : undefined,
    });
    return result;
  } catch (e: any) {
    reply.code(500);
    return { error: e.message };
  }
});

// Lightweight orchestration self-test; skips steps requiring missing keys unless mock mode.
app.get('/self-test', async () => {
  const aiStatus = {
    openaiKey: !!process.env.OPENAI_API_KEY,
    geminiKey: !!process.env.GEMINI_API_KEY,
    mock: isMockEnabled(),
  };
  const tests: any = {};
  // Workflow test
  if (aiStatus.mock || (aiStatus.geminiKey || aiStatus.openaiKey)) {
    try {
      const wf = await runWorkflow('ping');
      tests.workflow = { ok: true, keys: Object.keys(wf) };
    } catch (e: any) {
      tests.workflow = { ok: false, error: e.message };
    }
  } else {
    tests.workflow = { ok: false, skipped: 'no provider keys & mock disabled' };
  }
  // Council test
  if (aiStatus.mock || (aiStatus.geminiKey && aiStatus.openaiKey)) {
    try {
      const council = await runModelCouncil({ userPrompt: 'self-test small helper function' });
      tests.council = { ok: true, steps: council.timeline.length, patches: council.proposedPatches.length };
    } catch (e: any) {
      tests.council = { ok: false, error: e.message };
    }
  } else {
    tests.council = { ok: false, skipped: 'needs both OpenAI & Gemini or mock' };
  }
  // Ensemble test
  if (aiStatus.mock || (aiStatus.geminiKey && aiStatus.openaiKey)) {
    try {
      const ens = await runEnsemble({ prompt: 'ensemble self test', creativeVariants: 1, cache: false });
      tests.ensemble = { ok: true, have: Object.keys(ens) };
    } catch (e: any) {
      tests.ensemble = { ok: false, error: e.message };
    }
  } else {
    tests.ensemble = { ok: false, skipped: 'needs both providers or mock' };
  }
  return { server: { ok: true }, aiStatus, tests };
});

  const port = Number(process.env.PORT) || Number(process.env.ORCH_PORT) || 4000;
  app
    .listen({ port, host: '0.0.0.0' })
    .then(() => app.log.info(`Orchestrator listening on :${port}`))
    .catch((e: unknown) => {
      app.log.error({ err: e }, 'Failed to start orchestrator');
      process.exit(1);
    });
}

// Export a lightweight helper to allow worker memory fallback injection (dev only)
export function __memRecordResult(id: string, data: any) {
  if (allowNoRedis) memResults[id] = data;
}

bootstrap();
