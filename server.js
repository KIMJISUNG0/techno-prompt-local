import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
dotenv.config();

// ----------------------------
// 기본 설정 & 유틸
// ----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
const PRIMARY_MODEL = (process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim();
const FALLBACKS = (process.env.GEMINI_MODEL_FALLBACKS || 'gemini-1.5-flash-latest,gemini-1.5-pro-latest,gemini-1.5-pro,gemini-1.5-flash-8b-latest,gemini-2.0-flash,gemini-2.0-flash-exp')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const DEBUG_ERRORS = ['1', 'true', 'yes'].includes(String(process.env.DEBUG_ERRORS).toLowerCase());

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 10) return '*'.repeat(k.length);
  return k.slice(0, 4) + '...' + k.slice(-4);
}

// Gemini API 클라이언트는 요청마다 생성 (모델 fallback 시 동적 시도)
function createClient() {
  if (!GEMINI_API_KEY) return null;
  return new GoogleGenerativeAI(GEMINI_API_KEY);
}

// 미들웨어
app.use(express.json());
app.use(express.static(__dirname));

// 상태 확인 (간단 진단용)
app.get('/api/status', (_req, res) => {
  res.send({
    ok: true,
    hasKey: !!GEMINI_API_KEY,
    keyMasked: maskKey(GEMINI_API_KEY),
    primaryModel: PRIMARY_MODEL,
    fallbacks: FALLBACKS,
    debug: DEBUG_ERRORS
  });
});

// API 엔드포인트: /api/gemini (모델 폴백 포함)
app.post('/api/gemini', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).send({ error: 'Server missing GEMINI_API_KEY' });
  }
  try {
    const { prompt } = req.body || {};
    if (!prompt || !prompt.trim()) {
      return res.status(400).send({ error: 'Prompt is required' });
    }

    const systemPrompt = `You are a creative writer and expert music prompt engineer for Suno AI. Your task is to transform a structured, tag-based prompt into a single, rich, and evocative paragraph.\n\nCore Focus: Expand the MOOD and describe how instruments shape atmosphere. No markdown, no asterisks, one paragraph only.`;

    const orderedModels = [PRIMARY_MODEL, ...FALLBACKS.filter(m => m !== PRIMARY_MODEL)];
    const tried = [];
    let lastErr = null;
    const client = createClient();
    if (!client) throw new Error('Gemini client not initialized');

    for (const modelName of orderedModels) {
      tried.push(modelName);
      try {
        const model = client.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });
        const result = await model.generateContent(prompt);
        const text = result?.response?.text?.();
        if (!text) throw new Error('Empty response');
        return res.send({ text: text.replace(/[*#]/g, '').trim(), model: modelName, tried });
      } catch (err) {
        lastErr = err;
        const msg = (err.message || '').toLowerCase();
        // 모델 관련 404/지원 안함 류만 폴백 계속
        if (msg.includes('not found') || msg.includes('unsupported') || msg.includes('is not supported') || err.status === 404) {
          continue; // 다음 모델 시도
        }
        // 다른 유형이면 즉시 중단
        break;
      }
    }

    const baseError = { error: 'Failed to generate content from Gemini API', tried };
    if (DEBUG_ERRORS && lastErr) {
      baseError.detail = String(lastErr.message || lastErr).slice(0, 500);
    }
    return res.status(500).send(baseError);
  } catch (error) {
    const payload = { error: 'Failed to generate content from Gemini API' };
    if (DEBUG_ERRORS) payload.detail = String(error.message || error).slice(0, 500);
    console.error('Gemini API fatal error:', error);
    return res.status(500).send(payload);
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
  if (!GEMINI_API_KEY) {
    console.warn('[warn] GEMINI_API_KEY not set – /api/gemini will return 500');
  } else {
    console.log('[gemini] using model:', PRIMARY_MODEL, 'fallbacks:', FALLBACKS.join(', '));
  }
});