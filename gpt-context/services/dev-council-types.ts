export type Ticket = { id: string; title: string; priority: 'P0' | 'P1' | 'P2'; estimateH: number; dependsOn?: string[]; labels?: string[] };
export type DevPlan = {
  goal: string;
  scope: { in: string[]; out: string[] };
  success: { metrics: string[]; risks: string[]; assumptions: string[] };
  userStories: string[];
  api?: { endpoints: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; summary: string; input?: any; output?: any }[] };
  dataModel?: { entities: { name: string; fields: { name: string; type: string; notes?: string }[] }[]; mermaid?: string };
  architecture?: { components: string[]; decisions: string[]; mermaid?: string };
  tasks: Ticket[];
  testPlan: { acceptance: string[]; cases: { name: string; steps: string[]; expected: string }[] };
  openQuestions: string[];
};

export type Patch = { path: string; kind: 'create' | 'update'; language?: string; unifiedDiff?: string; content?: string };
