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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY) {
  console.error('[startup] Missing GEMINI_API_KEY env');
}
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';

const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const fastify = Fastify({ logger: true });

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
  try {
    const body = req.body || {};
    // Accept either {prompt:"..."} or {messages:[...]} structures
    let promptText = body.prompt;
    if (!promptText && Array.isArray(body.messages)) {
      // Concatenate message contents
      promptText = body.messages
        .map(m => (typeof m === 'string' ? m : m.content || m.text || ''))
        .join('\n');
    }
    if (!promptText) {
      reply.code(400).send({ error: 'Missing prompt' });
      return;
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const modelName = body.model || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(promptText);
    const text = result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    reply.send({ text });
  } catch (err) {
    fastify.log.error({ err }, 'Gemini proxy failure');
    reply.code(500).send({ error: 'Gemini request failed' });
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
