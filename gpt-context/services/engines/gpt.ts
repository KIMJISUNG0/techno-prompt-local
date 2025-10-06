import OpenAI from 'openai';
import { DevPlan } from '../dev-council-types';

const KEY = process.env.OPENAI_API_KEY;
const client = KEY ? new OpenAI({ apiKey: KEY }) : null;

function safeParseDevPlan(text: string): DevPlan {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first < 0 || last < 0) throw new Error('NO_JSON_OBJECT');
  return JSON.parse(cleaned.slice(first, last + 1));
}

export const gptEngine = {
  name: 'gpt' as const,
  available: !!client,
  async callDraft(prompt: string): Promise<DevPlan> {
    if (!client) throw new Error('NO_KEY');
    const sys = 'Return ONLY valid JSON for DevPlan schema.';
    const r = await client.chat.completions.create({
      model: process.env.DEVCOUNCIL_GPT_DRAFT_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });
    return safeParseDevPlan(r.choices[0].message?.content || '');
  },
  async callCritique(plans: DevPlan[]) {
    if (!client) return [];
    const inst = 'Critique plans, return up to 6 concise improvement bullets (no JSON).';
    const r = await client.chat.completions.create({
      model: process.env.DEVCOUNCIL_GPT_CRITIQUE_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: inst + '\n' + JSON.stringify(plans) }],
      temperature: 0.2,
    });
    return (r.choices[0].message?.content || '')
      .split('\n')
      .map((s) => s.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 6);
  },
  async callRevise(self: DevPlan, critiques: string[]) {
    if (!client) return self;
    const inst = 'Apply critique bullets and return updated DevPlan JSON only.';
    const r = await client.chat.completions.create({
      model: process.env.DEVCOUNCIL_GPT_REVISE_MODEL || 'gpt-4o',
      messages: [
        { role: 'user', content: inst + '\nCRITIQUES:\n' + critiques.join('\n') + '\nPLAN:\n' + JSON.stringify(self) },
      ],
      temperature: 0.2,
    });
    try {
      return safeParseDevPlan(r.choices[0].message?.content || '');
    } catch {
      return self;
    }
  },
};
