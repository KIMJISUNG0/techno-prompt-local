import Redis from 'ioredis';
import { Task, TaskSchema } from '../../orchestrator/task-schema';
// Optional memory fallback injection for dev without Redis
let recordResult: ((id: string, data: any) => void) | null = null;
try {
  // dynamic import to avoid circular when building
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const mod = await import('../../orchestrator/index.ts');
  if (typeof mod.__memRecordResult === 'function') recordResult = mod.__memRecordResult;
} catch {}

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const queueKey = process.env.QUEUE_KEY || 'tasks:pending';
const processedKey = process.env.PROCESSED_KEY || 'tasks:processed';

const redis = new Redis(redisUrl);

async function pullTask(): Promise<Task | null> {
  // BRPOP returns [listName, element]
  const res = await redis.brpop(queueKey, 5); // 5 sec block
  if (!res) return null;
  const [, raw] = res;
  try {
    const obj = JSON.parse(raw);
    return TaskSchema.parse(obj);
  } catch (e) {
    console.error('Invalid task payload', e);
    return null;
  }
}

async function processTask(task: Task) {
  console.log('[worker] Processing task', task.id, task.type);
  // Simulate processing
  await new Promise(r => setTimeout(r, 1000));
  // Store result summary
  const result = {
    id: task.id!,
    type: task.type,
    prompt: task.prompt,
    artifacts: [],
    doneAt: Date.now().toString()
  };
  if (redis.status === 'ready') {
    await redis.hset(`${processedKey}:${task.id}`, result as any);
  } else if (recordResult) {
    recordResult(task.id!, result);
  }
  console.log('[worker] Done', task.id);
}

async function loop() {
  while (true) {
    const task = await pullTask();
    if (!task) continue;
    try {
      await processTask(task);
    } catch (e) {
      console.error('Task failed', e);
    }
  }
}

loop().catch(e => {
  console.error(e);
  process.exit(1);
});
