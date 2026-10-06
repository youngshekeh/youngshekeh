import {
  ADVISORY_GOVERNANCE,
  NEBIUS_BASE_URL,
  buildNebiusMessages,
  enforceAdvisoryEnvelope,
  parseNebiusContent
} from '../src/nebius-advisory-v206.mjs';

const VERSION = 'v206-nebius-advisory-sidecar-v1';

function getApiKey() {
  return process.env.NEBIUS_API_KEY || process.env.NEBIUS_TOKEN_FACTORY_KEY || '';
}

function getModel() {
  return process.env.NEBIUS_MODEL || '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-TFA-Nebius-Sidecar', 'V206');

  if (req.method === 'GET') {
    const configured = Boolean(getApiKey() && getModel());
    return res.status(200).json({
      ok: true,
      version: VERSION,
      state: configured ? 'READY' : 'CONFIG_REQUIRED',
      provider: 'Nebius Token Factory',
      base_url: NEBIUS_BASE_URL,
      model: getModel() || null,
      required_env: ['NEBIUS_API_KEY', 'NEBIUS_MODEL'],
      governance: ADVISORY_GOVERNANCE
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const apiKey = getApiKey();
  const model = getModel();
  if (!apiKey || !model) {
    return res.status(503).json({
      ok: false,
      version: VERSION,
      state: 'CONFIG_REQUIRED',
      error: 'nebius_credentials_or_model_missing',
      required_env: ['NEBIUS_API_KEY', 'NEBIUS_MODEL'],
      governance: ADVISORY_GOVERNANCE
    });
  }

  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const messages = buildNebiusMessages(input);

  try {
    const upstream = await fetch(`${NEBIUS_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'THE-FATHER-ANALYTICS-V206/1.0'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        max_tokens: 900
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000)
    });

    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return res.status(502).json({
        ok: false,
        version: VERSION,
        state: 'UPSTREAM_ERROR',
        upstream_status: upstream.status,
        error: body?.error?.message || 'nebius_upstream_error',
        governance: ADVISORY_GOVERNANCE
      });
    }

    const content = body?.choices?.[0]?.message?.content ?? '';
    const envelope = enforceAdvisoryEnvelope(parseNebiusContent(content));

    return res.status(200).json({
      ok: true,
      version: VERSION,
      state: 'ADVISORY_READY',
      provider: 'Nebius Token Factory',
      model,
      request_id: body?.id || null,
      usage: body?.usage || null,
      ...envelope
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      version: VERSION,
      state: 'UPSTREAM_UNAVAILABLE',
      error: error?.name === 'TimeoutError' ? 'nebius_timeout' : 'nebius_transport_unavailable',
      governance: ADVISORY_GOVERNANCE
    });
  }
}
