import { describe, it, expect } from 'vitest';
import { runDevCouncil } from '../../services/dev-council';
import { getMetricsSummary } from '../../services/ai/metrics';

describe('dev-council metrics', () => {
  it('collects metrics for local engine', async () => {
    await runDevCouncil('test metrics collection', { mode: 'design' });
    const summary = getMetricsSummary();
    const hasLocalDraft = summary.some((r) => r.engine === 'local' && r.phase === 'draft' && r.count > 0);
    expect(hasLocalDraft).toBe(true);
  }, 20000);
});
