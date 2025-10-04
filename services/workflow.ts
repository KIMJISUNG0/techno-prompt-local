import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

type ModelOverrides = { gptModel?: string; geminiModel?: string };

function hasEnv(k: string) {
  return !!process.env[k] && process.env[k]!.trim() !== '';
}

async function withTimeout<T>(p: Promise<T>, ms = 60_000): Promise<T> {
  let t: NodeJS.Timeout;
  const killer = new Promise<never>((_, rej) => (t = setTimeout(() => rej(new Error(`Timeout ${ms}ms`)), ms)));
  try {
    const r = await Promise.race([p, killer]);
    return r as T;
  } finally {
    clearTimeout(t!);
  }
}

async function tryOnce<T>(fn: () => Promise<T>, retry = 1): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retry <= 0) throw e;
    return fn();
  }
}

export async function runWorkflow(
  userPrompt: string,
  opts?: {
    modelOverrides?: ModelOverrides;
    temperature?: number;
  }
): Promise<{
  originalPrompt: string;
  gemini: { ok: boolean; content: string; error?: string };
  gpt: { ok: boolean; content: string; error?: string };
  merged: { ok: boolean; content: string; error?: string };
}> {
  if (!userPrompt || userPrompt.trim().length < 3) {
    return {
      originalPrompt: userPrompt,
      gemini: { ok: false, content: '', error: 'prompt too short' },
      gpt: { ok: false, content: '', error: 'prompt too short' },
      merged: { ok: false, content: '', error: 'prompt too short' },
    };
  }

  const gptModel = opts?.modelOverrides?.gptModel ?? 'gpt-4.1';
  const geminiModel = opts?.modelOverrides?.geminiModel ?? 'gemini-1.5-pro';
  const temperature = opts?.temperature ?? 0.4;

  const openai = hasEnv('OPENAI_API_KEY') ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  const genAI = hasEnv('GEMINI_API_KEY') ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY!) : null;

  // Parallel phase: Gemini requirements + GPT initial draft
  const [geminiRes, gptRes] = await Promise.all([
    (async () => {
      if (!genAI) return { ok: false, content: '', error: 'GEMINI_API_KEY missing' as string };
      const model = genAI.getGenerativeModel({ model: geminiModel });
      try {
  const resp: any = await withTimeout(
          tryOnce(
            () =>
              model.generateContent(`아래 요구를 구조화해 JSON(가능하면 코드 친화적 키)로 정리해줘.\n불명확한 부분은 보수적으로 추정하고, 마지막에 "assumptions" 필드로 명시.\n요구:\n${userPrompt}`),
            1
          ),
          60_000
        );
  const text = resp?.response?.text ? resp.response.text() : String(resp?.response || '');
        return { ok: true, content: text };
      } catch (e: any) {
        return { ok: false, content: '', error: String(e.message ?? e) };
      }
    })(),
    (async () => {
      if (!openai) return { ok: false, content: '', error: 'OPENAI_API_KEY missing' as string };
      try {
  const resp: any = await withTimeout(
          tryOnce(
            () =>
              openai.chat.completions.create({
                model: gptModel,
                temperature,
                messages: [
                  {
                    role: 'system',
                    content: 'You are a senior TypeScript/React engineer. Return concise code blocks with minimal prose.',
                  },
                  {
                    role: 'user',
                    content: `다음 요구를 구현하는 핵심 코드 초안을 작성해줘.\n제출물은 TypeScript/React 기준으로, 테스트/타입 유효성을 고려하고, 필요한 파일 경로나 컴포넌트 이름도 제안해줘.\n요구:\n${userPrompt}`,
                  },
                ],
              }),
            1
          ),
          60_000
        );
  const text = resp?.choices?.[0]?.message?.content ?? '';
        return { ok: true, content: text };
      } catch (e: any) {
        return { ok: false, content: '', error: String(e.message ?? e) };
      }
    })(),
  ]);

  // Merge phase
  let merged = { ok: false, content: '', error: '' };
  if (!openai) {
    merged = { ok: false, content: '', error: 'OPENAI_API_KEY missing' };
  } else {
    try {
  const mergeResp: any = await withTimeout(
        tryOnce(
          () =>
            openai.chat.completions.create({
              model: gptModel,
              temperature: 0.3,
              messages: [
                {
                  role: 'system',
                  content: 'You are a principal engineer and technical writer. Produce a single, clean solution.',
                },
                {
                  role: 'user',
                  content: `아래 세 가지 정보를 통합해 "최적안"을 Markdown으로 제시해줘.\n필수 섹션:\n- Summary(핵심 요약)\n- Final Code (필요 파일별 코드 블록)\n- Notes (assumptions/주의점)\n입력:\n- Original Prompt: ${userPrompt}\n- Gemini Requirements:\n${geminiRes.ok ? geminiRes.content : `(error: ${geminiRes.error})`}\n- GPT Draft:\n${gptRes.ok ? gptRes.content : `(error: ${gptRes.error})`}`,
                },
              ],
            }),
          1
        ),
        60_000
      );
  merged = { ok: true, content: mergeResp?.choices?.[0]?.message?.content ?? '', error: '' };
    } catch (e: any) {
      merged = { ok: false, content: '', error: String(e.message ?? e) };
    }
  }

  return {
    originalPrompt: userPrompt,
    gemini: geminiRes,
    gpt: gptRes,
    merged,
  };
}
