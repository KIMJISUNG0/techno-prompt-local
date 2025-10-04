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
import { isMockEnabled } from '../services/ai-mock';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const queueKey = process.env.QUEUE_KEY || 'tasks:pending';

let redis: Redis | null = null;
const allowNoRedis = process.env.ORCH_ALLOW_NO_REDIS === '1';
// Only attempt Redis connection if we are NOT explicitly in memory-only mode.
if (!allowNoRedis) {
  try {
    redis = new Redis(redisUrl);
    redis.on('error', (e) => {
      // In normal mode we surface errors; in memory mode we stay silent.
      if (!allowNoRedis) {
        app.log.error({ err: e }, 'Redis connection error');
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
  await app.register(cors, { origin: true });

  if (allowNoRedis) {
    app.log.info('ORCH_ALLOW_NO_REDIS=1 -> Using in-memory queue & cache (Redis disabled)');
  }

app.get('/health', async () => ({ ok: true }));

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

  const port = Number(process.env.PORT || 4000);
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
