import { DevPlan } from '../dev-council-types';

function randId() {
  return 'T' + Math.random().toString(36).slice(2, 8);
}

export const localEngine = {
  name: 'local' as const,
  available: true,
  async callDraft(prompt: string): Promise<DevPlan> {
    return {
      goal: prompt.slice(0, 200),
      scope: { in: ['MVP'], out: ['Out-of-scope'] },
      success: { metrics: ['tests pass'], risks: ['over-scope'], assumptions: ['keys maybe missing'] },
      userStories: ['As a user I can run dev council locally'],
      api: { endpoints: [{ method: 'POST', path: '/dev-council', summary: 'Run council' }] },
      dataModel: { entities: [], mermaid: '' },
      architecture: { components: ['orchestrator', 'memory', 'council'], decisions: ['local-engine-fallback'], mermaid: '' },
      tasks: [
        { id: randId(), title: 'Implement SSE streaming', priority: 'P0', estimateH: 4 },
        { id: randId(), title: 'Add metrics wrapper', priority: 'P0', estimateH: 2 },
      ],
      testPlan: { acceptance: ['/dev-council returns 200'], cases: [{ name: 'smoke', steps: ['call'], expected: 'ok' }] },
      openQuestions: ['Need advanced scoring?'],
    };
  },
  async callCritique() {
    return ['Add rate limit', 'Improve error handling', 'Add docs section'];
  },
  async callRevise(self: DevPlan) {
    return self; // noop revise
  },
};
