import crypto from 'node:crypto';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Redis from 'ioredis';
import { runWorkflow } from './workflow.js';
import { runModelCouncil } from './model-council.js';
import { isMockEnabled, mockChat } from './ai-mock.js';

interface EnsembleOptions {
  prompt: string;
  creativeVariants?: number; // default 3
  highTemperature?: number;  // default 0.9
  timeoutMs?: number;        // soft target per sub-call (not enforcing hard cancel here)
  cache?: boolean;           // force cache on/off override
}

interface EnsembleResult {
  prompt: string;
  cached: boolean;
  timings: Record<string, number>;
  workflow?: Awaited<ReturnType<typeof runWorkflow>>;
  council?: Awaited<ReturnType<typeof runModelCouncil>>;
  creative: { variants: string[]; model: string; raw: string };
  finalCreative: { content: string; model: string; ok: boolean; error?: string };
  warnings: string[];
}

const has = (k: string) => !!process.env[k] && process.env[k]!.trim() !== '';
const openai = has('OPENAI_API_KEY') ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const genAI = has('GEMINI_API_KEY') ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY!) : null;
const mockMode = (!openai || !genAI) && isMockEnabled();

// Simple in-memory cache fallback
const memCache: Record<string, { at: number; ttl: number; value: EnsembleResult }> = {};

function sha1(s: string) { return crypto.createHash('sha1').update(s).digest('hex'); }

async function getRedis(): Promise<Redis | null> {
  if (!has('REDIS_URL')) return null;
  try {
    const r = new Redis(process.env.REDIS_URL!);
    return r;
  } catch { return null; }
}

function parseVariants(raw: string, expected: number): string[] {
  if (!raw) return [];
  const parts = raw.split(/---VARIANT---/i).map(p => p.trim()).filter(Boolean);
  if (parts.length >= expected) return parts.slice(0, expected);
  return parts; // maybe model returned fewer
}

async function generateCreativeVariants(prompt: string, variants: number, temp: number): Promise<{ variants: string[]; model: string; raw: string }> {
  // Prefer OpenAI -> Gemini -> Mock
  const creativeModelOverride = process.env.ENSEMBLE_CREATIVE_MODEL;
  if (openai) {
    const model = creativeModelOverride || 'gpt-4.1-mini';
    const resp: any = await openai.chat.completions.create({
      model,
      temperature: temp,
      messages: [
        { role: 'system', content: 'You are a divergent ideation assistant. Produce multiple distinct creative takes.' },
        { role: 'user', content: `Prompt:\n${prompt}\n요청: ${variants}개의 뚜렷하게 다른 창의적 변형(스타일/구조/관점)을 생성. 각 변형 사이 구분은 ---VARIANT--- 라인으로.` }
      ]
    });
    const raw = resp?.choices?.[0]?.message?.content || '';
    return { variants: parseVariants(raw, variants), model, raw };
  }
  if (genAI) {
    const model = creativeModelOverride || 'gemini-1.5-flash';
    const gm = genAI.getGenerativeModel({ model });
    const resp: any = await gm.generateContent(`Prompt:\n${prompt}\n${variants}개의 독립적 창의 변형. ---VARIANT--- 구분 사용.`);
    const raw = resp?.response?.text?.() || resp?.response?.text || '';
    return { variants: parseVariants(raw, variants), model, raw };
  }
  // Mock fallback returns a single deterministic variant repeated logically
  const raw = mockChat({ model: 'creative-mock', role: 'creative', prompt, format: 'markdown' });
  return { variants: [raw], model: 'mock', raw };
}

async function converge(prompt: string, workflow: any | undefined, council: any | undefined, variants: string[]): Promise<{ content: string; model: string; ok: boolean; error?: string }> {
  const baseContext = [
    `ORIGINAL PROMPT:\n${prompt}`,
    workflow?.merged?.content ? `WORKFLOW MERGED:\n${workflow.merged.content}` : '',
    council?.summaryMarkdown ? `COUNCIL SUMMARY:\n${council.summaryMarkdown}` : '',
    variants.length ? `VARIANTS:\n${variants.map((v,i)=>`[${i+1}]\n${v}`).join('\n\n')}` : ''
  ].filter(Boolean).join('\n\n');

  if (openai) {
    try {
      const model = process.env.ENSEMBLE_CONVERGE_MODEL || 'gpt-4.1';
      const resp: any = await openai.chat.completions.create({
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: 'You distill multiple creative threads into a single high-quality actionable output.' },
          { role: 'user', content: baseContext + '\n\n요청: 가장 혁신적이면서 실행 가능한 통합안을 Markdown 섹션 (Summary / Highlights / Recommended Steps) 형태로.' }
        ]
      });
      return { content: resp?.choices?.[0]?.message?.content || '', model, ok: true };
    } catch (e: any) { return { content: '', model: 'openai', ok: false, error: e.message }; }
  }
  if (genAI) {
    try {
      const model = process.env.ENSEMBLE_CONVERGE_MODEL || 'gemini-1.5-pro';
      const gm = genAI.getGenerativeModel({ model });
      const resp: any = await gm.generateContent(baseContext + '\n\n통합 요약 Markdown (Summary / Highlights / Recommended Steps)');
      const text = resp?.response?.text?.() || resp?.response?.text || '';
      return { content: text, model, ok: true };
    } catch (e: any) { return { content: '', model: 'gemini', ok: false, error: e.message }; }
  }
  // mock converge
  return { content: mockChat({ model: 'converge-mock', role: 'merge', prompt, format: 'markdown' }), model: 'mock', ok: true };
}

export async function runEnsemble(opts: EnsembleOptions): Promise<EnsembleResult> {
  if (!opts.prompt || opts.prompt.trim().length < 3) {
    return {
      prompt: opts.prompt,
      cached: false,
      timings: {},
      creative: { variants: [], model: 'n/a', raw: '' },
      finalCreative: { content: '', model: 'n/a', ok: false, error: 'prompt too short' },
      warnings: ['prompt too short']
    };
  }

  const cacheEnabled = typeof opts.cache === 'boolean' ? opts.cache : process.env.ENSEMBLE_CACHE === '1';
  const ttl = Number(process.env.ENSEMBLE_CACHE_TTL || 600);
  const keyHash = sha1(opts.prompt);
  const cacheKey = `ensemble:cache:${keyHash}`;
  const startAll = Date.now();
  let redis: Redis | null = null;
  let cachedValue: EnsembleResult | null = null;

  if (cacheEnabled) {
    // memory first
    const mem = memCache[cacheKey];
    if (mem && Date.now() - mem.at < mem.ttl * 1000) {
      cachedValue = { ...mem.value, cached: true };
    } else {
      redis = await getRedis();
      if (redis) {
        const raw = await redis.get(cacheKey);
        if (raw) {
          try { cachedValue = { ...(JSON.parse(raw) as EnsembleResult), cached: true }; } catch { /* ignore */ }
        }
      }
    }
  }
  if (cachedValue) return cachedValue;

  const timings: Record<string, number> = {};
  const t = (label: string, since: number) => { timings[label] = Date.now() - since; };

  const tWorkflow = Date.now();
  const workflowPromise = runWorkflow(opts.prompt).then(r => { t('workflow', tWorkflow); return r; });
  const tCouncil = Date.now();
  const councilPromise = runModelCouncil({ userPrompt: opts.prompt }).then(r => { t('council', tCouncil); return r; });
  const tCreative = Date.now();
  const creativePromise = generateCreativeVariants(opts.prompt, opts.creativeVariants ?? 3, opts.highTemperature ?? 0.9).then(r => { t('creativeVariants', tCreative); return r; });

  const [workflow, council, creative] = await Promise.all([workflowPromise, councilPromise, creativePromise]);

  const tConverge = Date.now();
  const finalCreative = await converge(opts.prompt, workflow, council, creative.variants);
  t('converge', tConverge);
  t('total', startAll);

  const warnings: string[] = [];
  if (mockMode) warnings.push('mock mode active');
  if (!openai) warnings.push('openai missing');
  if (!genAI) warnings.push('gemini missing');

  const result: EnsembleResult = {
    prompt: opts.prompt,
    cached: false,
    timings,
    workflow,
    council,
    creative,
    finalCreative,
    warnings
  };

  if (cacheEnabled) {
    memCache[cacheKey] = { at: Date.now(), ttl, value: result };
    if (redis) {
      try { await redis.setex(cacheKey, ttl, JSON.stringify(result)); } catch { /* ignore */ }
    }
  }
  return result;
}
