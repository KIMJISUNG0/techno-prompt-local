/* Remote smoke (non-stream) – requires process.env.ORCH */
const ORCH = process.env.ORCH || 'http://localhost:4000';
if (!process.env.ORCH) {
  console.warn('[WARN] ORCH env not set, falling back to http://localhost:4000');
}

async function j(method: string, path: string, body?: any) {
  const url = ORCH + path;
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    console.error(method, path, res.status, await res.text());
    return null;
  }
  try { return await res.json(); } catch { return null; }
}

async function main() {
  console.log('ORCH =', ORCH);
  // Wait for health (retry up to 12 * 500ms = 6s)
  let health: any = null;
  for (let i = 0; i < 12; i++) {
    try {
      health = await j('GET', '/health');
      if (health?.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!health?.ok) {
    console.error('[FAIL] health check failed after retries');
  } else {
    console.log('health OK');
  }
  await j('POST', '/memory/active', { taskId: 'REMOTE-SMOKE', goal: 'remote smoke', openQuestions: [], pendingRisks: [], nextSteps: [] });
  const hyd = await j('GET', '/memory/hydrate?goal=remote%20smoke');
  console.log('hydrate.cards', hyd?.cards?.length);
  const sync = await j('POST', '/memory/sync');
  console.log('sync', sync);
  await j('POST', '/dev-council', { prompt: 'Design remote note module', mode: 'design' });
  const usage = await j('GET', '/ai-usage/summary');
  console.log('usage.summary rows', usage?.summary?.length);
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
