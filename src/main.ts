import './styles.css';
import './autonomous.css';

const cleanRoute = new Set(['/access', '/member', '/owner', '/status']);
if (cleanRoute.has(window.location.pathname)) {
  window.location.replace(`${window.location.pathname}/${window.location.search}${window.location.hash}`);
}

document.documentElement.classList.add('js');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(pointer: fine)');
const parallax = document.querySelector<HTMLElement>('[data-parallax]');

let raf = 0;

function resetParallax() {
  if (!parallax) return;
  parallax.style.setProperty('--rx', '0deg');
  parallax.style.setProperty('--ry', '0deg');
}

function onPointerMove(event: PointerEvent) {
  if (!parallax || reducedMotion.matches || !finePointer.matches) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const rect = parallax.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    parallax.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
    parallax.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
  });
}

parallax?.addEventListener('pointermove', onPointerMove);
parallax?.addEventListener('pointerleave', resetParallax);
reducedMotion.addEventListener('change', resetParallax);

const reveals = document.querySelectorAll<HTMLElement>('[data-reveal]');

if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );

  reveals.forEach((element) => observer.observe(element));
} else {
  reveals.forEach((element) => element.classList.add('is-visible'));
}

const year = document.querySelector<HTMLElement>('#copyright-year');
if (year) year.textContent = ` © ${new Date().getFullYear()} THE FATHER ANALYTICS.`;

const SUPABASE_URL = 'https://mpcelmjiycjpdyyflisn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';

function setAutonomyText(id: string, value: unknown) {
  const node = document.querySelector<HTMLElement>(`#${id}`);
  if (node) node.textContent = String(value ?? 'UNAVAILABLE');
}

function renderTags(id: string, values: unknown[]) {
  const node = document.querySelector<HTMLElement>(`#${id}`);
  if (!node) return;
  node.replaceChildren();
  const list = Array.isArray(values) && values.length ? values : ['NONE'];
  for (const value of list) {
    const tag = document.createElement('span');
    tag.textContent = String(value).replaceAll('_', ' ');
    node.appendChild(tag);
  }
}

async function loadAutonomousState() {
  const modeNode = document.querySelector<HTMLElement>('#autonomyMode');
  if (!modeNode) return;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_v70_autonomous_state`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    });
    if (!response.ok) throw new Error(`autonomy_http_${response.status}`);
    const state = await response.json();
    const health = state?.health ?? {};
    const governance = state?.governance ?? {};
    const connectors = health?.connectors ?? {};
    const generated = state?.generated_at ? new Date(state.generated_at) : null;

    setAutonomyText('autonomyMode', state?.mode ?? 'UNAVAILABLE');
    setAutonomyText('autonomyScore', Number.isFinite(Number(state?.system_score)) ? `${state.system_score}/100` : '--');
    setAutonomyText('autonomyDatabase', health?.database ?? 'UNAVAILABLE');
    setAutonomyText('autonomyEdge', health?.edge_runtime ?? 'UNAVAILABLE');
    setAutonomyText('autonomyEvidence', health?.evidence ?? 'UNAVAILABLE');
    setAutonomyText('autonomyConnectors', `${connectors?.healthy ?? 0}/${connectors?.required ?? 0} required connectors fresh`);
    setAutonomyText('autonomyMarket', state?.market_session ?? 'UNAVAILABLE');
    setAutonomyText('autonomyPermission', `${governance?.action_permitted ?? 'WAIT'} · ${governance?.capital_permission ?? '0R'}`);
    setAutonomyText('autonomyUpdated', generated && !Number.isNaN(generated.getTime()) ? `Governed state · ${generated.toLocaleString()}` : 'Governed state unavailable');
    renderTags('autonomyBlockers', state?.blockers ?? []);
    renderTags('autonomyActions', state?.autonomous_actions ?? []);
    if (state?.mode) modeNode.dataset.state = String(state.mode);
  } catch {
    setAutonomyText('autonomyMode', 'DATABASE STATE UNAVAILABLE');
    setAutonomyText('autonomyUpdated', 'The public state channel could not be verified.');
    renderTags('autonomyBlockers', ['PUBLIC_STATE_CHANNEL_UNAVAILABLE']);
    renderTags('autonomyActions', ['FAIL_CLOSED']);
    setAutonomyText('autonomyPermission', 'WAIT · 0R');
  }
}

void loadAutonomousState();
window.setInterval(() => void loadAutonomousState(), 300_000);
