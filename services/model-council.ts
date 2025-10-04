import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

/*
 Model Council Orchestrator ("multi-agent meeting")
 Steps (default):
 1. Requirements Analyst (Gemini Flash/Pro) -> structured requirements JSON/text
 2. Architect (GPT mini) -> architecture plan & file list
 3. Implementer (GPT higher tier) -> initial code patch suggestions
 4. Reviewer (Gemini) -> critique & risk list
 5. Refiner (GPT) -> revised patches
 6. Output aggregator -> normalized patch objects + summary

 Returned shape includes: timeline (each step), proposedPatches[], summaryMarkdown.

 Patch Format (LLM output contract expected):
 ```patch
 FILE: relative/path/to/file.tsx
 --- PATCH START ---
 <entire new file contents OR unified diff style>
 --- PATCH END ---
 ```
 This service does NOT auto-apply patches; an explicit apply function could be added later.
*/

export interface CouncilOptions {
  userPrompt: string;
  temperatureDraft?: number;
  temperatureRefine?: number;
  gptImplementModel?: string;
  gptArchitectModel?: string;
  gptRefineModel?: string;
  geminiReqModel?: string;
  geminiReviewModel?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface CouncilStepRecord {
  role: string;
  model: string;
  ok: boolean;
  content: string;
  error?: string;
  started: number;
  ended: number;
}

export interface CouncilResult {
  originalPrompt: string;
  timeline: CouncilStepRecord[];
  proposedPatches: Array<{ file: string; body: string; rawBlock: string }>; // naive extraction
  summaryMarkdown: string;
  warnings: string[];
}

function env(k: string) { return process.env[k]; }
function has(k: string) { return !!env(k) && env(k)!.trim() !== ''; }

const openai = has('OPENAI_API_KEY') ? new OpenAI({ apiKey: env('OPENAI_API_KEY') }) : null;
const genAI = has('GEMINI_API_KEY') ? new GoogleGenerativeAI(env('GEMINI_API_KEY')!) : null;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  const killer = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`Timeout ${ms}ms`)), ms); });
  try { return await Promise.race([p, killer]); } finally { clearTimeout(t!); }
}

async function retry<T>(fn: () => Promise<T>, retries: number, label: string): Promise<T> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) { lastErr = e; if (i === retries) break; await new Promise(r => setTimeout(r, 500 * (i + 1))); }
  }
  throw new Error(`${label} failed: ${lastErr?.message || lastErr}`);
}

function now() { return Date.now(); }

function extractPatches(markdown: string) {
  const blocks: Array<{ file: string; body: string; rawBlock: string }> = [];
  const regex = /```patch[\s\S]*?FILE:\s*(.+?)\n[\s\S]*?--- PATCH START ---\n([\s\S]*?)--- PATCH END ---\n?```/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markdown)) !== null) {
    blocks.push({ file: m[1].trim(), body: m[2], rawBlock: m[0] });
  }
  return blocks;
}

export async function runModelCouncil(opts: CouncilOptions): Promise<CouncilResult> {
  const warnings: string[] = [];
  if (!opts.userPrompt || opts.userPrompt.trim().length < 3) {
    return { originalPrompt: opts.userPrompt, timeline: [], proposedPatches: [], summaryMarkdown: '**Error: prompt too short**', warnings: ['prompt too short'] };
  }
  if (!openai) warnings.push('OPENAI_API_KEY missing (GPT steps will fail)');
  if (!genAI) warnings.push('GEMINI_API_KEY missing (Gemini steps will fail)');

  const timeoutMs = opts.timeoutMs ?? 60_000;
  const retries = opts.maxRetries ?? 1;

  // Model selection with sensible fallbacks
  // Environment override layer lets you update to newer model labels without code edits
  const mReq = opts.geminiReqModel || process.env.COUNCIL_REQ_MODEL || 'gemini-1.5-flash';
  const mReview = opts.geminiReviewModel || process.env.COUNCIL_REVIEW_MODEL || process.env.COUNCIL_REQ_MODEL || mReq;
  const mArch = opts.gptArchitectModel || process.env.COUNCIL_ARCH_MODEL || 'gpt-4.1-mini';
  const mImpl = opts.gptImplementModel || process.env.COUNCIL_IMPL_MODEL || 'gpt-4.1-mini';
  const mRefine = opts.gptRefineModel || process.env.COUNCIL_REFINE_MODEL || 'gpt-4.1';

  const timeline: CouncilStepRecord[] = [];
  const record = async (role: string, model: string, fn: () => Promise<string>): Promise<string> => {
    const start = now();
    try {
      const content = await withTimeout(retry(fn, retries, role), timeoutMs);
      timeline.push({ role, model, ok: true, content, started: start, ended: now() });
      return content;
    } catch (e: any) {
      const msg = String(e.message ?? e);
      timeline.push({ role, model, ok: false, content: '', error: msg, started: start, ended: now() });
      return '';
    }
  };

  // 1 Requirements (Gemini)
  const requirements = await record('requirements', mReq, async () => {
    if (!genAI) throw new Error('gemini unavailable');
    const model = genAI.getGenerativeModel({ model: mReq });
    const resp: any = await model.generateContent(`요구사항을 JSON 스키마 스타일 + assumptions 필드로 요약:\n${opts.userPrompt}`);
    return resp?.response?.text?.() || resp?.response?.text || '';
  });

  // 2 Architecture (GPT)
  const architecture = await record('architecture', mArch, async () => {
    if (!openai) throw new Error('openai unavailable');
    const r = await openai.chat.completions.create({
      model: mArch,
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'You are an architect. Output high-level plan, file list, responsibilities.' },
        { role: 'user', content: `PROMPT:\n${opts.userPrompt}\nREQUIREMENTS:\n${requirements}` }
      ]
    });
    return r.choices?.[0]?.message?.content || '';
  });

  // 3 Implementation Draft (GPT)
  const draft = await record('implementation-draft', mImpl, async () => {
    if (!openai) throw new Error('openai unavailable');
    const r = await openai.chat.completions.create({
      model: mImpl,
      temperature: opts.temperatureDraft ?? 0.5,
      messages: [
        { role: 'system', content: 'You write concise TypeScript patches. Use patch blocks with FILE header and PATCH delimiters.' },
        { role: 'user', content: `ARCHITECTURE:\n${architecture}\nProduce initial patches implementing core logic.` }
      ]
    });
    return r.choices?.[0]?.message?.content || '';
  });

  // 4 Review (Gemini)
  const review = await record('review', mReview, async () => {
    if (!genAI) throw new Error('gemini unavailable');
    const model = genAI.getGenerativeModel({ model: mReview });
    const resp: any = await model.generateContent(`코드 패치 초안에 대해 위험/누락/개선 TOP10 목록 제공:\n${draft}`);
    return resp?.response?.text?.() || resp?.response?.text || '';
  });

  // 5 Refine (GPT)
  const refined = await record('refine', mRefine, async () => {
    if (!openai) throw new Error('openai unavailable');
    const r = await openai.chat.completions.create({
      model: mRefine,
      temperature: opts.temperatureRefine ?? 0.35,
      messages: [
        { role: 'system', content: 'You merge feedback into improved patches. Output only patches + final summary section.' },
        { role: 'user', content: `ORIGINAL PROMPT:\n${opts.userPrompt}\nREQUIREMENTS:\n${requirements}\nDRAFT PATCHES:\n${draft}\nREVIEW FEEDBACK:\n${review}\nRefine now.` }
      ]
    });
    return r.choices?.[0]?.message?.content || '';
  });

  // 6 Aggregate & extract patches (prefer refined if ok else draft)
  const lastStep = timeline.findLast(s => s.role === 'refine');
  const mergeSource = (lastStep && lastStep.ok && lastStep.content) ? lastStep.content : draft;
  const patches = extractPatches(mergeSource);

  const summaryMarkdown = `# Council Summary\n\n- Requirements OK: ${timeline.find(s=>s.role==='requirements')?.ok}\n- Architecture OK: ${timeline.find(s=>s.role==='architecture')?.ok}\n- Draft OK: ${timeline.find(s=>s.role==='implementation-draft')?.ok}\n- Review OK: ${timeline.find(s=>s.role==='review')?.ok}\n- Refine OK: ${timeline.find(s=>s.role==='refine')?.ok}\n- Patch count: ${patches.length}\n\n## Warnings\n${warnings.length?warnings.map(w=>`- ${w}`).join('\n'):'(none)'}\n`;

  return {
    originalPrompt: opts.userPrompt,
    timeline,
    proposedPatches: patches,
    summaryMarkdown,
    warnings
  };
}
