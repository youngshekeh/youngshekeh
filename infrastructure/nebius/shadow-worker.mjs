import { createServer } from 'node:http';
import { GOVERNANCE, assessProbe, validateSource } from './shadow-core.mjs';

const SOURCE = validateSource(process.env.TFA_OBSERVE_URL ||
  'https://thefatheranalytics.com/api/public-recovery-triage');
const PORT = Number(process.env.PORT || 8080);
const PERIOD = Math.max(300000, Math.min(3600000, Number(process.env.TFA_POLL_INTERVAL_MS) || 600000));
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('invalid_port');

let last = null;
let probing = false;
async function observe() {
  if (probing) return;
  probing = true;
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(SOURCE, {
      method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'TFA-Nebius-V312-ReadOnly/1.0' },
      signal: AbortSignal.timeout(12000)
    });
    const contentType = response.headers.get('content-type') || '';
    const length = Number(response.headers.get('content-length') || 0);
    if (!contentType.toLowerCase().includes('application/json') || length > 262144) {
      throw new Error('invalid_body');
    }
    const text = await response.text();
    if (text.length > 262144) throw new Error('invalid_body');
    const body = JSON.parse(text);
    last = assessProbe({status: response.status, body, checkedAt});
  } catch {
    last = assessProbe({status: 0, body: null, checkedAt});
  } finally {
    probing = false;
    console.log(JSON.stringify({event: 'read_only_probe', ...last}));
  }
}

const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const method = req.method;
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.writeHead(405); return res.end(JSON.stringify({error:'method_not_allowed'}));
  }
  if (req.url === '/healthz') {
    res.writeHead(200); return res.end(JSON.stringify({ok: true, role: 'shadow_observer'}));
  }
  if (req.url === '/readyz') {
    // Only proves the isolated observer fetched JSON, not that the machine has recovered.
    const ok = Boolean(last?.observation_ok);
    res.writeHead(ok ? 200 : 503);
    return res.end(JSON.stringify({observer_ready:ok,machine_operational_verified:false,governance:GOVERNANCE}));
  }
  if (req.url === '/status') {
    res.writeHead(last?.observation_ok ? 200 : 503);
    return res.end(JSON.stringify({version:'V312', role:'read_only_shadow', observation:last,
      machine_operational_verified:false, governance:GOVERNANCE}));
  }
  res.writeHead(404); return res.end(JSON.stringify({error:'not_found'}));
});

server.listen(PORT, '0.0.0.0', () => console.log('TFA Nebius V312 shadow observer listening'));
await observe();
const interval = setInterval(observe, PERIOD);
function stop() { clearInterval(interval); server.close(() => process.exit(0)); }
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
