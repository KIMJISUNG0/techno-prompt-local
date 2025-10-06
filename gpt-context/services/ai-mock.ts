// Simple mock AI generators to allow "free" mode development without paid API keys.
// If real API keys (OPENAI_API_KEY / GEMINI_API_KEY) are missing and ALLOW_MOCK_AI=1,
// workflow and council services will use these helpers instead of failing.

interface MockChatParams {
  model: string;
  role: string; // logical role e.g. requirements / architecture / draft
  prompt: string;
  format?: 'markdown' | 'json' | 'patches';
}

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function mockChat({ model, role, prompt, format }: MockChatParams): string {
  const h = hash(prompt + role) % 1000;
  if (format === 'json') {
    return JSON.stringify(
      {
        role,
        mock: true,
        assumptions: ["mock-mode", "no-external-api"],
        derivedKey: `k${h}`,
        summary: prompt.slice(0, 80),
      },
      null,
      2
    );
  }
  if (format === 'patches') {
    // Provide deterministic pseudo patch so downstream extraction works.
    return (
      '```patch\n' +
      'FILE: src/mock/free-mode-example.ts\n' +
      '--- PATCH START ---\n' +
      `// Generated in mock free mode (role=${role}, model=${model})\n` +
      `export const MOCK_DERIVED = ${h};\n` +
      `export function mockInfo() { return '${role}:${h}'; }\n` +
      '--- PATCH END ---\n' +
      '```\n'
    );
  }
  // default markdown-like
  return `**[MOCK-${model}] ${role}**\nSeed:${h}\nPromptDigest:${prompt.slice(0, 60)}...`;
}

export function isMockEnabled() {
  return process.env.ALLOW_MOCK_AI === '1' || process.env.ALLOW_MOCK_AI === 'true';
}
