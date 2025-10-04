// Simple SSE smoke: connect to stream endpoint, print phases.
const testPrompt = process.argv.slice(2).join(' ') || 'SSE smoke test minimal feature';
async function main() {
  const url = `http://localhost:4000/dev-council/stream?prompt=${encodeURIComponent(testPrompt)}`;
  const res = await fetch(url, { headers: { Accept: 'text/event-stream' } });
  if (!res.body) throw new Error('No body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + 10_000; // 10s
  while (Date.now() < deadline) {
    const r = await reader.read();
    if (r.done) break;
    buf += decoder.decode(r.value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 2);
      if (!chunk) continue;
      const lines = chunk.split(/\n/);
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (event === 'phase') {
        console.log('[PHASE]', data);
      } else if (event === 'error') {
        console.error('[ERROR]', data);
      } else if (event === 'done') {
        console.log('[DONE]', data);
        return;
      }
    }
  }
  console.log('SSE smoke finished (timeout)');
}
main().catch((e) => {
  console.error('sse-smoke failed', e);
  process.exit(1);
});
