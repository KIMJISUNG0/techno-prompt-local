/* Integrated orchestrator smoke test (no streaming) */
async function j(method: string, path: string, body?: any) {
  const url = `http://localhost:4000${path}`;
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch((e) => ({ ok: false, status: 0, text: () => Promise.resolve(e.message) }) as any);
  if (!res) return { ok: false, status: 0, error: 'no response object' };
  let text: string | undefined;
  try { text = await res.text(); } catch { text = ''; }
  let json: any = null;
  if (text) { try { json = JSON.parse(text); } catch { /* ignore */ } }
  return { ok: res.ok, status: (res as any).status, json, text };
}

async function waitHealth(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await j('GET', '/health');
    if (r.ok && r.json?.ok) return r;
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false, status: 0, error: 'timeout health' } as any;
}

function pad(s: string, n = 18) { return (s + ' '.repeat(n)).slice(0, n); }

async function main() {
  const results: { name: string; ok: boolean; detail?: string }[] = [];
  const push = (name: string, ok: boolean, detail?: string) => results.push({ name, ok, detail });

  let health = await waitHealth(2000);
  if (!health.ok) {
    console.log('[auto-start] orchestrator not responding, starting in-process...');
    // Ensure memory mode
    (process as any).env.ORCH_ALLOW_NO_REDIS = '1';
    await import('../orchestrator/index');
    health = await waitHealth(8000);
  }
  push('health', !!health.ok, health.ok ? '200' : 'fail');

  const memActive = await j('POST', '/memory/active', { taskId: 'SMOKE', goal: 'orchestrator smoke', openQuestions: [], pendingRisks: [], nextSteps: [] });
  push('memory/active', memActive.ok, String(memActive.status));

  const hydrate = await j('GET', '/memory/hydrate?goal=smoke');
  push('memory/hydrate', hydrate.ok && Array.isArray(hydrate.json?.cards), hydrate.ok ? `${hydrate.json?.cards?.length} cards` : hydrate.text?.slice(0,60));

  const musicPreset = await j('GET', '/music/presets-natural');
  push('music/presets', musicPreset.ok && Array.isArray(musicPreset.json?.items), musicPreset.ok ? `${musicPreset.json?.items.length}` : String(musicPreset.status));

  const musicPrompt = await j('POST', '/music/prompt-natural', { substyles: ['P-Funk'], groove: 'swung 16th hats' });
  push('music/prompt', musicPrompt.ok && (musicPrompt.json?.text?.length ?? 0) <= 200, musicPrompt.json?.length ? `${musicPrompt.json.length}` : String(musicPrompt.status));

  const council = await j('POST', '/dev-council', { prompt: 'tiny helper function', mode: 'design' });
  const councilOk = council.ok && typeof council.json?.finalSpecMd === 'string' && (council.json.finalSpecMd.length > 20) && Array.isArray(council.json?.patches);
  push('/dev-council', councilOk, councilOk ? `${council.json?.patches?.length} patches` : String(council.status));

  const metrics = await j('GET', '/ai-usage/summary');
  push('ai-usage/summary', metrics.ok && Array.isArray(metrics.json?.summary), metrics.ok ? `${metrics.json?.summary?.length} rows` : String(metrics.status));

  // Pretty print
  const lines: string[] = [];
  const fail = results.filter(r => !r.ok).length;
  lines.push('--- Orchestrator Smoke Report ---');
  for (const r of results) {
    lines.push(`${pad(r.name)} | ${r.ok ? 'OK ' : 'FAIL'} | ${r.detail || ''}`);
  }
  lines.push(`Summary: ${results.length - fail}/${results.length} passed`);
  console.log(lines.join('\n'));
  if (fail) process.exit(1);
}

main().catch(e => { console.error('smoke-unhandled', e); process.exit(1); });
