import { DevPlan, Patch, Ticket } from './dev-council-types';
import { geminiEngine } from './engines/gemini';
import { gptEngine } from './engines/gpt';
import { localEngine } from './engines/local';
import { withMetrics } from './ai/metrics';

export interface DevCouncilOptions {
  mode?: 'design' | 'code' | 'review';
  onEvent?: (e: { phase: string; engine?: string; ok?: boolean; msg?: string }) => void;
}

type Engine = typeof geminiEngine | typeof gptEngine | typeof localEngine;

function scorePlan(p: DevPlan) {
  const clarity = Math.min(1, ((p.userStories?.length || 0) / 5 + (p.api?.endpoints?.length || 0) / 10));
  const feasibility = Math.min(1, 0.5 + (p.tasks?.length || 0) / 10);
  const impact = Math.min(1, (p.success?.metrics?.length || 0) / 5);
  return { clarity, feasibility, impact, total: clarity + feasibility + impact };
}

function synthesize(a: DevPlan, b: DevPlan): DevPlan {
  return {
    goal: a.goal || b.goal,
    scope: { in: Array.from(new Set([...(a.scope?.in || []), ...(b.scope?.in || [])])), out: Array.from(new Set([...(a.scope?.out || []), ...(b.scope?.out || [])])) },
    success: {
      metrics: Array.from(new Set([...(a.success?.metrics || []), ...(b.success?.metrics || [])])),
      risks: Array.from(new Set([...(a.success?.risks || []), ...(b.success?.risks || [])])),
      assumptions: Array.from(new Set([...(a.success?.assumptions || []), ...(b.success?.assumptions || [])])),
    },
    userStories: Array.from(new Set([...(a.userStories || []), ...(b.userStories || [])])),
    api: { endpoints: [...((a.api?.endpoints) || []), ...((b.api?.endpoints) || [])] },
    dataModel: { entities: [...((a.dataModel?.entities) || []), ...((b.dataModel?.entities) || [])], mermaid: a.dataModel?.mermaid || b.dataModel?.mermaid || '' },
    architecture: { components: Array.from(new Set([...(a.architecture?.components || []), ...(b.architecture?.components || [])])), decisions: Array.from(new Set([...(a.architecture?.decisions || []), ...(b.architecture?.decisions || [])])), mermaid: a.architecture?.mermaid || b.architecture?.mermaid || '' },
    tasks: [...(a.tasks || []), ...(b.tasks || [])],
    testPlan: { acceptance: Array.from(new Set([...(a.testPlan?.acceptance || []), ...(b.testPlan?.acceptance || [])])), cases: [...(a.testPlan?.cases || []), ...(b.testPlan?.cases || [])] },
    openQuestions: Array.from(new Set([...(a.openQuestions || []), ...(b.openQuestions || [])])),
  };
}

function makeTickets(p: DevPlan): Ticket[] {
  const seen = new Set<string>();
  return (p.tasks || [])
    .filter((t) => (seen.has(t.title) ? false : (seen.add(t.title), true)))
    .map((t) => ({ ...t }))
    .sort((a, b) => (a.priority < b.priority ? -1 : a.priority > b.priority ? 1 : a.estimateH - b.estimateH));
}

function buildFinalSpecMd(p: DevPlan) {
  return [
    '# Council Spec',
    '## Goal',
    p.goal,
    '## Scope',
    `IN: ${p.scope.in.join(', ')} / OUT: ${p.scope.out.join(', ')}`,
    '## Success',
    `Metrics: ${p.success.metrics.join(', ')}`,
    `Risks: ${p.success.risks.join(', ')}`,
    `Assumptions: ${p.success.assumptions.join(', ')}`,
    '## User Stories',
    ...(p.userStories || []).map((s) => `- ${s}`),
    '## API',
    ...((p.api?.endpoints || []).map((e) => `- ${e.method} ${e.path}: ${e.summary}`)),
    '## Architecture',
    ...(p.architecture?.components || []).map((c) => `- ${c}`),
    '## Tasks',
    ...makeTickets(p).map((t) => `- [${t.priority}] ${t.title} (${t.estimateH}h)`),
    '## Open Questions',
    ...(p.openQuestions || []).map((q) => `- ${q}`),
  ].join('\n');
}

function suggestPatches(p: DevPlan, mode: 'design' | 'code' | 'review'): Patch[] {
  if (mode !== 'code') return [];
  const content = buildFinalSpecMd(p);
  return [
    { path: 'README.council.md', kind: 'create', language: 'markdown', content },
  ];
}

export async function runDevCouncil(userPrompt: string, opts: DevCouncilOptions = {}) {
  const onEvent = opts.onEvent || (() => {});
  if (!userPrompt || userPrompt.trim().length < 3) throw new Error('prompt too short');
  const engines: Engine[] = [geminiEngine, gptEngine, localEngine].filter((e) => e.available || e.name === 'local');
  if (!engines.length) throw new Error('no engines available');

  onEvent({ phase: 'start', msg: 'begin council' });
  // Draft phase
  onEvent({ phase: 'draft:start' });
  const drafts = await Promise.all(
    engines.map((e) =>
      withMetrics(e.name, 'draft', () => e.callDraft(userPrompt)).catch((err) => {
        onEvent({ phase: 'draft', engine: e.name, ok: false, msg: err.message });
        return null;
      })
    )
  );
  const okDrafts = drafts.map((d, i) => ({ eng: engines[i].name, plan: d })).filter((x) => !!x.plan) as { eng: string; plan: DevPlan }[];
  if (!okDrafts.length) throw new Error('all draft calls failed');
  onEvent({ phase: 'draft:done', msg: `drafts=${okDrafts.length}` });

  // Critique
  onEvent({ phase: 'critique:start' });
  const critiques = await Promise.all(
    okDrafts.map((d, i) => {
      const peers = okDrafts.filter((_, j) => j !== i).map((x) => x.plan);
      const eng = engines.find((e) => e.name === d.eng)!;
      return withMetrics(eng.name, 'critique', () => eng.callCritique(peers)).catch(() => []);
    })
  );
  onEvent({ phase: 'critique:done' });

  // Revise
  onEvent({ phase: 'revise:start' });
  const revised = await Promise.all(
    okDrafts.map((d, i) => {
      const eng = engines.find((e) => e.name === d.eng)!;
      return withMetrics(eng.name, 'revise', () => eng.callRevise(d.plan, critiques[i] || [])).catch(() => d.plan);
    })
  );
  onEvent({ phase: 'revise:done' });

  // Score & vote
  onEvent({ phase: 'score:start' });
  const scores = revised.map((r) => scorePlan(r));
  const ranking = revised
    .map((r, i) => ({ i, total: scores[i].total }))
    .sort((a, b) => b.total - a.total)
    .map((x) => x.i);
  const top = revised[ranking[0]];
  const second = revised[ranking[1]] || top;
  onEvent({ phase: 'score:done', msg: `winnerIndex=${ranking[0]}` });

  // Merge
  onEvent({ phase: 'merge:start' });
  const merged = synthesize(top, second);
  const finalSpecMd = buildFinalSpecMd(merged);
  const tickets = makeTickets(merged);
  const patches = suggestPatches(merged, opts.mode || 'design');
  onEvent({ phase: 'merge:done' });
  onEvent({ phase: 'done', ok: true });

  return {
    finalSpecMd,
    plan: merged,
    tickets,
    patches,
    trace: {
      drafts: okDrafts.length,
      scores,
      ranking,
      engines: engines.map((e) => e.name),
    },
  };
}
