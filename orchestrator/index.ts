import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import Redis from 'ioredis';
import { normalizeTask, Task } from './task-schema';
import 'node:crypto';
import { runWorkflow } from '../services/workflow';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const queueKey = process.env.QUEUE_KEY || 'tasks:pending';

let redis: Redis | null = null;
const allowNoRedis = process.env.ORCH_ALLOW_NO_REDIS === '1';
try {
  redis = new Redis(redisUrl);
  redis.on('error', (e) => {
    if (!allowNoRedis) {
      app.log.error({ err: e }, 'Redis connection error');
    }
  });
} catch (e) {
  if (!allowNoRedis) throw e;
}

// In-memory fallback queue (dev only)
const memQueue: Task[] = [];
const memResults: Record<string, any> = {};
const app: FastifyInstance = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get('/health', async () => ({ ok: true }));

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

// Export a lightweight helper to allow worker memory fallback injection (dev only)
export function __memRecordResult(id: string, data: any) {
  if (allowNoRedis) memResults[id] = data;
}

const port = Number(process.env.PORT || 4000);
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`Orchestrator listening on :${port}`))
  .catch((e: unknown) => {
    app.log.error({ err: e }, 'Failed to start orchestrator');
    process.exit(1);
  });
