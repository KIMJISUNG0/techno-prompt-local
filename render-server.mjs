// Render deployment unified server: serves Suno Prompt Studio static HTML + secure Gemini proxy
// Lightweight Fastify server so we can deploy as a single Render Web Service (not Static Site)
// Env Vars:
//   GEMINI_API_KEY (required)
//   ACCESS_TOKEN  (optional shared-secret; if set, client must send Authorization: Bearer <token>)
//   CORS_ORIGINS  (optional comma list; default *)
//   STATIC_DIR    (optional path; default suno-prompt-studio)

import Fastify from 'fastify';
import cors from '@fastify/cors';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
/* global process, console */
// (We intentionally avoid using __dirname; all paths are relative to process.cwd())

const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.cwd(), process.env.STATIC_DIR)
  : path.join(process.cwd(), 'suno-prompt-studio');
const INDEX_FILE = path.join(STATIC_DIR, 'index.html');

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''); // strip accidental quotes
if (!GEMINI_API_KEY) {
  console.error('[startup] Missing GEMINI_API_KEY env');
}
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim();
const DEBUG_ERRORS = (process.env.DEBUG_ERRORS === '1' || process.env.DEBUG_ERRORS === 'true');
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';

const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 10) return '*'.repeat(k.length);
  return k.slice(0, 4) + '...' + k.slice(-4);
}

const fastify = Fastify({ logger: true });
fastify.log.info({
  event: 'startup',
  staticDir: STATIC_DIR,
  indexExists: !!fs.existsSync(INDEX_FILE),
  corsOrigins: CORS_ORIGINS,
  model: GEMINI_MODEL,
  hasKey: !!GEMINI_API_KEY,
  keyMasked: maskKey(GEMINI_API_KEY)
}, 'Server configuration');

// CORS (allow credentials false; simple JSON API)
await fastify.register(cors, {
  origin: (origin, cb) => {
    if (CORS_ORIGINS.includes('*') || !origin) return cb(null, true);
    if (CORS_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Origin not allowed'), false);
  },
});

// Simple shared-secret auth (optional)
fastify.addHook('preHandler', (req, reply, done) => {
  if (ACCESS_TOKEN && req.routeOptions.url.startsWith('/api/')) {
    const header = req.headers['authorization'] || '';
    if (header !== `Bearer ${ACCESS_TOKEN}`) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
  }
  done();
});

// Gemini proxy endpoint
fastify.post('/api/gemini', async (req, reply) => {
  if (!GEMINI_API_KEY) {
    reply.code(500).send({ error: 'Server missing Gemini API key' });
    return;
  }
  const started = Date.now();
  try {
    const body = req.body || {};
    let promptText = body.prompt;
    if (!promptText && Array.isArray(body.messages)) {
      promptText = body.messages
        .map(m => (typeof m === 'string' ? m : m.content || m.text || ''))
        .join('\n');
    }
    if (!promptText) {
      reply.code(400).send({ error: 'Missing prompt' });
      return;
    }
    const modelName = (body.model || GEMINI_MODEL).trim();
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });
    // Library supports generateContent(string) or array of parts.
    const result = await model.generateContent(promptText);
    const text = result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    reply.send({ text, model: modelName, ms: Date.now() - started });
  } catch (err) {
    const statusLike = err.status || err.code || err.response?.status;
    let rawMsg = err.message || String(err);
    if (err.response?.data) {
      try { rawMsg += ' :: ' + JSON.stringify(err.response.data).slice(0, 500); } catch { /* ignore */ }
    }
    const sanitized = rawMsg.replace(GEMINI_API_KEY, '[KEY]');
    fastify.log.error({ err, statusLike, sanitized }, 'Gemini proxy failure');
    // Provide richer debug only if DEBUG_ERRORS enabled
    const payload = { error: 'Gemini request failed' };
    if (DEBUG_ERRORS) {
      payload.detail = sanitized;
      if (statusLike) payload.status = statusLike;
    }
    if (String(sanitized).toLowerCase().includes('permission') || statusLike === 403) payload.hint = 'Check if model name is allowed for your key or enable in AI Studio.';
    if (String(sanitized).toLowerCase().includes('api key') || statusLike === 401) payload.hint = 'Invalid or restricted API key. Ensure you created a Generative Language API key, not an OAuth client.';
    if (String(sanitized).toLowerCase().includes('model') && String(sanitized).toLowerCase().includes('not found')) payload.hint = 'Model name may be incorrect. Try gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash-exp, gemini-2.0-flash, etc.';
    reply.code(500).send(payload);
  }
});

// Lightweight status + config (safe) endpoint (no key leak)
fastify.get('/api/status', async (_req, reply) => {
  reply.send({
    ok: true,
    model: GEMINI_MODEL,
    hasKey: !!GEMINI_API_KEY,
    keyMasked: maskKey(GEMINI_API_KEY),
    staticDir: STATIC_DIR,
    uptime: Number(process.uptime().toFixed(1)),
    now: new Date().toISOString()
  });
});

// Active diagnostic ping (attempt minimal generation) – only when DEBUG_ERRORS enabled
fastify.get('/api/debug/gemini', async (_req, reply) => {
  if (!GEMINI_API_KEY) return reply.code(500).send({ error: 'No key configured' });
  const start = Date.now();
  const modelName = GEMINI_MODEL;
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });
    const res = await model.generateContent('ping');
    const text = res?.response?.text?.() || '';
    reply.send({ ok: true, model: modelName, ms: Date.now() - start, sample: text.slice(0, 120) });
  } catch (err) {
    const statusLike = err.status || err.code || err.response?.status;
    let rawMsg = err.message || String(err);
    if (err.response?.data) {
      try { rawMsg += ' :: ' + JSON.stringify(err.response.data).slice(0, 500); } catch { /* ignore */ }
    }
    reply.code(500).send({ ok: false, model: modelName, status: statusLike, detail: DEBUG_ERRORS ? rawMsg.replace(GEMINI_API_KEY, '[KEY]') : undefined });
  }
});

// Very lightweight static file serving (only index.html + direct assets under STATIC_DIR)
// We avoid extra dependency for now; if many assets later, consider @fastify/static
fastify.get('/assets/*', async (req, reply) => {
  const rel = req.url.replace(/^\/assets\//, 'assets/');
  const filePath = path.join(STATIC_DIR, rel);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return reply.send(fs.createReadStream(filePath));
  }
  reply.code(404).send('Not Found');
});

fastify.get('/favicon.ico', async (req, reply) => {
  const filePath = path.join(STATIC_DIR, 'favicon.ico');
  if (fs.existsSync(filePath)) return reply.send(fs.createReadStream(filePath));
  reply.code(204).send();
});

// SPA fallback
fastify.get('/*', async (req, reply) => {
  if (!fs.existsSync(INDEX_FILE)) {
    reply.code(500).send('Missing index.html in ' + STATIC_DIR);
    return;
  }
  reply.type('text/html').send(fs.readFileSync(INDEX_FILE, 'utf8'));
});

const port = process.env.PORT || 8080;
fastify.listen({ port, host: '0.0.0.0' }).then(() => {
  fastify.log.info(`Server running on :${port} serving ${STATIC_DIR}`);
});
