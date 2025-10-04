/** Music natural prompt smoke test (in-process, no child spawn for Windows compatibility). */
import process from 'node:process';

const ORIGIN = process.env.ORCH_URL || 'http://localhost:4000';
const START_TIMEOUT_MS = 15000;
const TOTAL_TIMEOUT_MS = 30000; // safety overall timeout

function wait(ms:number){ return new Promise(r=>setTimeout(r,ms)); }

async function fetchJson(path:string, init?:RequestInit){
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), 4000);
  try {
    const r = await fetch(ORIGIN+path, { ...init, signal: controller.signal });
    const text = await r.text();
    let data:any; try { data = text?JSON.parse(text):{}; } catch { data={ raw:text }; }
    return { status: r.status, data };
  } finally { clearTimeout(t); }
}

async function ensureServerInProcess(){
  // If already up, skip.
  try { const r = await fetch(ORIGIN+'/health'); if (r.ok) return; } catch {}
  // Force memory mode before importing orchestrator.
  if (!process.env.ORCH_ALLOW_NO_REDIS) process.env.ORCH_ALLOW_NO_REDIS = '1';
  // Dynamically import orchestrator (it self-bootstraps).
  await import('../orchestrator/index.ts');
  const startAt = Date.now();
  while (Date.now() - startAt < START_TIMEOUT_MS) {
    try { const r = await fetch(ORIGIN+'/health'); if (r.ok) return; } catch {}
    await wait(300);
  }
  throw new Error('Server start timeout');
}

function assert(cond:any,msg:string){ if(!cond) throw new Error(msg); }

async function run(){
  const globalTimer = setTimeout(()=>{
    console.error('[TIMEOUT] Global smoke timeout');
    process.exit(2);
  }, TOTAL_TIMEOUT_MS);
  const start = Date.now();
  try {
    await ensureServerInProcess();
    const health = await fetchJson('/health');
    assert(health.status===200 && health.data.ok, 'health failed');
    const presets = await fetchJson('/music/presets-natural');
    assert(presets.status===200 && Array.isArray(presets.data.items), 'presets failed');
    const body = {
      substyles:['P-Funk','G-Funk'], bpm:106, groove:'swung 16th hats, tight backbeat',
      fx:['tape saturation','light plate reverb'], mix:['punchy','warm'], includeLengthHint:true,
      arrangement:[{section:'intro',bars:8},{section:'hook',bars:16},{section:'break',bars:8},{section:'hook',bars:16}]
    };
    const prompt = await fetchJson('/music/prompt-natural?debug=1', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    assert(prompt.status===200,'prompt http '+prompt.status);
    assert(typeof prompt.data.text==='string','prompt text missing');
    assert(prompt.data.length<=200,'prompt >200 chars');
    console.log(JSON.stringify({
      health: health.data,
      presets: { count: presets.data.items.length },
      prompt: {
        length: prompt.data.length,
        diversity: prompt.data?.debug?.diversity,
        truncated: prompt.data?.debug?.truncated,
        stages: prompt.data?.debug?.stages?.length,
        compressionRatio: prompt.data?.debug?.compressionRatio,
        originalLength: prompt.data?.debug?.originalLength,
        warnings: prompt.data?.debug?.warnings
      },
      ms: Date.now()-start
    }, null, 2));
    console.log('MUSIC_SMOKE_OK');
  } catch (e:any) {
    console.error('MUSIC_SMOKE_FAIL', e.message);
    process.exitCode = 1;
  } finally {
    clearTimeout(globalTimer);
    // No graceful Fastify close since orchestrator does not export app; exit now to avoid hanging process.
    setTimeout(()=>process.exit(process.exitCode ?? 0), 50);
  }
}

run();

