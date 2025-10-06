import { FastifyInstance } from 'fastify';
import { runDevCouncil } from '../services/dev-council';

function sseSend(reply: any, event: string, data: any) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function registerDevCouncilRoutes(app: FastifyInstance) {
  // Non-stream version
  app.post('/dev-council', async (req, reply) => {
    const body: any = req.body || {};
    if (!body.prompt) return reply.code(400).send({ error: 'missing prompt' });
    try {
      const out = await runDevCouncil(String(body.prompt), { mode: body.mode || 'design' });
      return out;
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // Streaming version
  app.get('/dev-council/stream', { config: { rateLimit: { max: 120 } } }, async (req, reply) => {
    const q: any = req.query || {};
    const prompt = q.prompt;
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();
    if (!prompt) {
      sseSend(reply, 'error', { message: 'missing prompt' });
      sseSend(reply, 'done', { ok: false });
      reply.raw.end();
      return reply;
    }
    try {
      await runDevCouncil(String(prompt), {
        mode: q.mode || 'design',
        onEvent: (e) => sseSend(reply, e.phase === 'done' ? 'done' : 'phase', e),
      });
    } catch (e: any) {
      sseSend(reply, 'error', { message: e.message });
    } finally {
      sseSend(reply, 'done', { ok: true });
      reply.raw.end();
    }
    return reply;
  });
}
