import http from 'node:http';

function post(path: string, body: any) {
  return new Promise<{ status?: number; body: string }>((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request(
      { hostname: 'localhost', port: 4000, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } },
      (res) => {
        let s = '';
        res.on('data', (c) => (s += c));
        res.on('end', () => resolve({ status: res.statusCode, body: s }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
function get(path: string) {
  return new Promise<{ status?: number; body: string }>((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port: 4000, path, method: 'GET' },
      (res) => {
        let s = '';
        res.on('data', (c) => (s += c));
        res.on('end', () => resolve({ status: res.statusCode, body: s }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    await post('/memory/active', { taskId: 'T-1', goal: 'Memory system smoke', openQuestions: [], pendingRisks: [], nextSteps: [] });
    const hyd = await get('/memory/hydrate?goal=Memory system smoke hydration test');
    console.log('hydrate.status =', hyd.status);
    console.log('hydrate.sample =', hyd.body.slice(0, 200));
    if (hyd.status !== 200) process.exit(1);
    console.log('Memory smoke OK');
  } catch (e) {
    console.error('Smoke failed', e);
    process.exit(1);
  }
})();
