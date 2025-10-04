import { normalizeTask } from './task-schema';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const queueKey = process.env.QUEUE_KEY || 'tasks:pending';
const redis = new Redis(redisUrl);

async function main() {
  const task = normalizeTask({
    type: 'MUSIC_GENERATE',
    prompt: 'Hard techno 135bpm dark warehouse kick rumble',
    params: { bpm: 135, seed: Date.now() % 10000 }
  });
  await redis.lpush(queueKey, JSON.stringify(task));
  console.log('Enqueued task', task);
  redis.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
