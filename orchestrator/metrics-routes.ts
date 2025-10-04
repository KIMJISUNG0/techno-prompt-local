import { FastifyInstance } from 'fastify';
import { getUsageRaw, getMetricsSummary } from '../services/ai/metrics';

export async function registerMetricsRoutes(app: FastifyInstance) {
  app.get('/ai-usage', async (req) => {
    const q: any = req.query || {};
    const mins = q.mins ? Number(q.mins) : 60;
    return { minutes: mins, entries: getUsageRaw(mins) };
  });
  app.get('/ai-usage/summary', async () => {
    return { summary: getMetricsSummary() };
  });
}
