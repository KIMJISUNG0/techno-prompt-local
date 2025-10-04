import { GoogleGenerativeAI } from '@google/generative-ai';
import { DevPlan } from '../dev-council-types';

const KEY = process.env.GEMINI_API_KEY;

function safeParse(text: string): DevPlan {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first < 0 || last < 0) throw new Error('NO_JSON');
  return JSON.parse(cleaned.slice(first, last + 1));
}

export const geminiEngine = {
  name: 'gemini' as const,
  available: !!KEY,
  async callDraft(prompt: string): Promise<DevPlan> {
    if (!KEY) throw new Error('NO_KEY');
    const genAI = new GoogleGenerativeAI(KEY);
    const model = genAI.getGenerativeModel({ model: process.env.DEVCOUNCIL_GEMINI_DRAFT_MODEL || 'gemini-1.5-pro-latest' });
    const sys = 'Return ONLY valid JSON DevPlan';
  const res = await model.generateContent(sys + '\n' + prompt);
  return safeParse(res.response.text());
  },
  async callCritique(peers: DevPlan[]) {
    if (!KEY) return [];
    const genAI = new GoogleGenerativeAI(KEY);
    const model = genAI.getGenerativeModel({ model: process.env.DEVCOUNCIL_GEMINI_CRITIQUE_MODEL || 'gemini-1.5-flash' });
    const inst = 'Critique plans, return up to 6 concise improvement bullets.';
  const res = await model.generateContent(inst + '\n' + JSON.stringify(peers));
    return res.response
      .text()
      .split('\n')
      .map((s) => s.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 6);
  },
  async callRevise(self: DevPlan, critiques: string[]) {
    if (!KEY) return self;
    const genAI = new GoogleGenerativeAI(KEY);
    const model = genAI.getGenerativeModel({ model: process.env.DEVCOUNCIL_GEMINI_REVISE_MODEL || 'gemini-1.5-pro-latest' });
    const inst = 'Apply critique bullets and return updated DevPlan JSON only.';
    const res = await model.generateContent(
      inst + '\nCRITIQUES:\n' + critiques.join('\n') + '\nPLAN:\n' + JSON.stringify(self)
    );
    try {
      return safeParse(res.response.text());
    } catch {
      return self;
    }
  },
};
