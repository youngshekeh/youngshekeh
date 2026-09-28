import './styles.css';

type DomainConfig = {
  label: string;
  rootCauses: string[];
  evidence: string[];
  levers: string[];
  risks: string[];
  metrics: string[];
};

const configs: Record<string, DomainConfig> = {
  'cost-of-living': {
    label: 'Cost of living',
    rootCauses: ['Income growth versus price growth', 'Food, energy, housing and transport cost transmission', 'Currency and import-price pressure', 'Supply bottlenecks and market concentration', 'Fiscal and monetary policy effects'],
    evidence: ['Household income distribution', 'Category-level inflation', 'Rent, food, energy and transport prices', 'Exchange-rate and import-cost data', 'Wage and employment trends'],
    levers: ['Target the dominant cost channel rather than headline inflation alone', 'Increase supply or reduce bottlenecks in essential categories', 'Protect the most exposed households with measurable targeting', 'Reduce policy actions that amplify second-round price pressure'],
    risks: ['Short-term relief that reduces future supply', 'Untargeted subsidies that create fiscal stress', 'Price controls that shift shortages elsewhere'],
    metrics: ['Real household income', 'Essential-cost share of income', 'Food and energy inflation', 'Rent burden', 'Coverage and fiscal cost of interventions'],
  },
  'growth-jobs': {
    label: 'Growth & jobs',
    rootCauses: ['Weak demand or investment', 'Low productivity', 'Skills mismatch', 'Infrastructure constraints', 'Cost of capital and business formation barriers'],
    evidence: ['Employment and underemployment', 'Sector productivity', 'Investment formation', 'Credit conditions', 'Firm creation and closure data'],
    levers: ['Remove the binding productivity constraint', 'Lower friction for viable business formation and expansion', 'Match training to measured employer demand', 'Prioritize infrastructure with clear productivity spillovers'],
    risks: ['Jobs programs without durable demand', 'Capital misallocation', 'Training disconnected from actual labor-market needs'],
    metrics: ['Employment-to-population ratio', 'Real wage growth', 'Output per worker', 'Private investment', 'New firm survival'],
  },
  'food-energy': {
    label: 'Food & energy security',
    rootCauses: ['Production shortfall', 'Input-cost shock', 'Logistics and storage losses', 'Import dependence', 'Grid or fuel-system fragility'],
    evidence: ['Production volumes', 'Inventory and storage', 'Import share', 'Transport costs', 'Grid reliability and generation mix'],
    levers: ['Diversify supply and critical inputs', 'Reduce storage and logistics losses', 'Improve resilience of power and transport infrastructure', 'Use targeted buffers instead of permanent distortion'],
    risks: ['Subsidy lock-in', 'Single-supplier dependence', 'Infrastructure projects without maintenance capacity'],
    metrics: ['Availability', 'Price volatility', 'Import dependence', 'Loss rates', 'Outage hours'],
  },
  'financial-stress': {
    label: 'Financial stress',
    rootCauses: ['High real rates', 'Debt maturity concentration', 'Liquidity mismatch', 'Currency exposure', 'Credit deterioration'],
    evidence: ['Debt service ratios', 'Maturity schedule', 'Funding spreads', 'FX liabilities', 'Non-performing credit'],
    levers: ['Reduce maturity and liquidity mismatch', 'Prioritize solvency over cosmetic liquidity', 'Hedge concentrated currency exposure', 'Stage interventions around measurable stress thresholds'],
    risks: ['Moral hazard', 'Hidden losses', 'Liquidity support for insolvent entities'],
    metrics: ['Coverage ratios', 'Funding spread', 'Default rate', 'Liquidity buffer', 'FX mismatch'],
  },
  'africa-development': {
    label: 'African development',
    rootCauses: ['Power and transport constraints', 'Cost and availability of capital', 'Trade friction', 'Public-finance limits', 'Institutional execution capacity'],
    evidence: ['Electricity reliability', 'Logistics cost', 'Credit access', 'Trade time and cost', 'Project completion and maintenance data'],
    levers: ['Sequence infrastructure around productive clusters', 'Use blended capital where risk genuinely blocks viable projects', 'Reduce border and logistics friction', 'Build maintenance and execution capacity into project design'],
    risks: ['Debt without productivity gains', 'Prestige infrastructure', 'Projects detached from local demand or maintenance capacity'],
    metrics: ['Power reliability', 'Logistics time', 'Private investment crowd-in', 'Export complexity', 'Project utilization'],
  },
  'ai-transition': {
    label: 'AI transition',
    rootCauses: ['Adoption gap', 'Compute or data constraints', 'Workflow mismatch', 'Skills displacement', 'Regulatory uncertainty'],
    evidence: ['Task-level adoption', 'Cost per automated workflow', 'Productivity change', 'Labor reallocation', 'Compute and data access'],
    levers: ['Automate high-friction tasks before whole jobs', 'Measure productivity before scaling', 'Pair deployment with worker transition pathways', 'Use governance proportional to demonstrated risk'],
    risks: ['Automation without productivity gains', 'Concentrated market power', 'Skill erosion', 'Overregulation before evidence'],
    metrics: ['Output per worker', 'Cycle time', 'Error rate', 'Adoption persistence', 'Worker transition outcomes'],
  },
  general: {
    label: 'General systems problem',
    rootCauses: ['Incentives', 'Capacity', 'Information', 'Coordination', 'Resource constraints'],
    evidence: ['Baseline outcome', 'Affected population', 'Process bottlenecks', 'Resource flows', 'Stakeholder incentives'],
    levers: ['Change the binding constraint first', 'Test the smallest reversible intervention', 'Align incentives with the target outcome', 'Build feedback measurement into the intervention'],
    risks: ['Solving a symptom instead of the cause', 'Unmeasured second-order effects', 'Irreversible action before validation'],
    metrics: ['Primary outcome', 'Cost per outcome', 'Adoption', 'Failure rate', 'Distributional effects'],
  },
};

const $ = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement | null;
const storageKey = 'tfa_world_problem_lab_v1';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char] || char));
}

function list(items: string[]) {
  return '<ul>' + items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>';
}

function build() {
  const problem = String(($('problem') as HTMLTextAreaElement)?.value || '').trim();
  const domain = String(($('domain') as HTMLSelectElement)?.value || 'general');
  const geography = String(($('geography') as HTMLInputElement)?.value || '').trim();
  const objective = String(($('objective') as HTMLInputElement)?.value || '').trim();
  const horizon = String(($('horizon') as HTMLSelectElement)?.value || '');
  const evidenceInput = String(($('evidence') as HTMLTextAreaElement)?.value || '').trim();
  const constraints = String(($('constraints') as HTMLTextAreaElement)?.value || '').trim();
  const message = $('problem-message');

  if (!problem) {
    if (message) message.textContent = 'Describe the problem before building a decision map.';
    return;
  }

  const config = configs[domain] || configs.general;
  const evidenceItems = [...config.evidence];
  if (evidenceInput) evidenceItems.unshift('User-provided evidence: ' + evidenceInput);

  const detect = [
    'Problem: ' + problem,
    geography ? 'Affected geography / population: ' + geography : 'Affected geography / population: not specified',
    objective ? 'Desired outcome: ' + objective : 'Desired outcome: define a measurable improvement before intervention',
    'Decision horizon: ' + horizon,
  ];

  const diagnose = [
    ...config.rootCauses,
    constraints ? 'Hard constraints to respect: ' + constraints : 'Hard constraints are not yet specified',
  ];

  const simulate = [
    'Base case: current drivers persist with no major intervention',
    'Improvement case: the dominant binding constraint is reduced and second-order effects remain manageable',
    'Adverse case: the intervention treats a symptom, shifts the problem elsewhere or creates a larger constraint',
    'Falsification rule: abandon a causal hypothesis when the expected leading indicator does not move after a defined test window',
  ];

  const solve = [
    ...config.levers,
    'Prefer reversible pilots before irreversible scale where uncertainty is high',
    'Rank solution options by expected outcome, implementation cost, distributional effect and failure reversibility',
  ];

  const measure = [
    ...config.metrics,
    ...config.risks.map((risk) => 'Watch risk: ' + risk),
    'Freeze the pre-intervention baseline so later evaluation cannot rewrite the starting point',
  ];

  const payload = { problem, domain, geography, objective, horizon, evidenceInput, constraints, savedAt: new Date().toISOString() };
  localStorage.setItem(storageKey, JSON.stringify(payload));

  const output = $('problem-output');
  if (!output) return;
  output.innerHTML = `
    <div class="problem-toolbar">
      <span class="kicker">FRAMEWORK-DERIVED · NOT A FORECAST</span>
      <button id="copy-map" class="secondary" type="button">Copy Map</button>
    </div>
    <div class="problem-summary">
      <span class="kicker">${escapeHtml(config.label)}</span>
      <h2>${escapeHtml(problem)}</h2>
      <p>${escapeHtml(objective || 'Define the target outcome before choosing an intervention.')}</p>
      <div class="problem-meta">
        <span>${escapeHtml(geography || 'GEOGRAPHY UNSPECIFIED')}</span>
        <span>${escapeHtml(horizon)}</span>
        <span>EVIDENCE GATED</span>
      </div>
    </div>
    <div class="problem-stages">
      <article class="problem-stage"><header><span class="stage-no">01</span><h3>Detect</h3></header>${list(detect)}${list(evidenceItems)}</article>
      <article class="problem-stage"><header><span class="stage-no">02</span><h3>Diagnose</h3></header>${list(diagnose)}</article>
      <article class="problem-stage"><header><span class="stage-no">03</span><h3>Simulate</h3></header>${list(simulate)}</article>
      <article class="problem-stage"><header><span class="stage-no">04</span><h3>Solve</h3></header>${list(solve)}</article>
      <article class="problem-stage"><header><span class="stage-no">05</span><h3>Measure</h3></header>${list(measure)}</article>
    </div>
    <div class="problem-warning">This decision map is a structured starting point. It does not substitute for verified local data, domain expertise, legal authority or professional judgment.</div>
  `;

  const copy = $('copy-map') as HTMLButtonElement | null;
  copy?.addEventListener('click', async () => {
    const text = (output.innerText || '').trim();
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Select text to copy';
    }
  });

  if (message) message.textContent = 'Decision map built and saved locally in this browser.';
}

function restore() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const saved = JSON.parse(raw);
    const entries: Array<[string, string]> = [
      ['problem', saved.problem || ''],
      ['domain', saved.domain || 'general'],
      ['geography', saved.geography || ''],
      ['objective', saved.objective || ''],
      ['horizon', saved.horizon || '0–3 months'],
      ['evidence', saved.evidenceInput || ''],
      ['constraints', saved.constraints || ''],
    ];
    for (const [id, value] of entries) {
      const element = $(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (element) element.value = value;
    }
    if (saved.problem) build();
  } catch {
    localStorage.removeItem(storageKey);
  }
}

($('problem-form') as HTMLFormElement | null)?.addEventListener('submit', (event) => {
  event.preventDefault();
  build();
});

$('reset-problem')?.addEventListener('click', () => {
  localStorage.removeItem(storageKey);
  (['problem','geography','objective','evidence','constraints'] as const).forEach((id) => {
    const element = $(id) as HTMLInputElement | HTMLTextAreaElement | null;
    if (element) element.value = '';
  });
  const domain = $('domain') as HTMLSelectElement | null;
  const horizon = $('horizon') as HTMLSelectElement | null;
  if (domain) domain.value = 'cost-of-living';
  if (horizon) horizon.value = '0–3 months';
  const output = $('problem-output');
  if (output) output.innerHTML = '<div class="problem-empty"><div><span class="kicker">WAITING FOR A PROBLEM</span><h2>Evidence before solutions.</h2><p>Describe a real problem on the left. The lab will build a five-stage decision map and save it locally in this browser.</p></div></div>';
  const message = $('problem-message');
  if (message) message.textContent = 'Framework-derived output. No external data is fetched from this form.';
});

restore();