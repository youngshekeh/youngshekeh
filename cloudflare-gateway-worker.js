const APP_ORIGIN = 'https://the-father-analytics-9o1a1m.v2.appdeploy.ai';
const ROUTES = new Map([
  ['/access', '/access.html'],
  ['/member', '/member.html'],
  ['/owner', '/owner.html'],
  ['/status', '/status.html'],
]);

function mapPath(pathname) {
  return ROUTES.get(pathname) || pathname;
}

function rewriteLocation(value, publicOrigin) {
  if (!value) return value;
  try {
    const url = new URL(value, APP_ORIGIN);
    if (url.origin === APP_ORIGIN) {
      return `${publicOrigin}${url.pathname}${url.search}${url.hash}`;
    }
  } catch {}
  return value;
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const upstream = new URL(APP_ORIGIN);
    upstream.pathname = mapPath(incoming.pathname);
    upstream.search = incoming.search;

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ray');
    headers.delete('cf-visitor');
    headers.delete('cf-ipcountry');

    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = request.body;
    }

    const response = await fetch(upstream.toString(), init);
    const out = new Headers(response.headers);
    out.set('X-TFA-Gateway', 'cloudflare-appdeploy');
    out.set('X-Content-Type-Options', 'nosniff');
    out.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    const location = out.get('Location');
    if (location) out.set('Location', rewriteLocation(location, incoming.origin));

    if (incoming.pathname === '/member' || incoming.pathname === '/owner' || incoming.pathname.endsWith('/member.html') || incoming.pathname.endsWith('/owner.html')) {
      out.set('Cache-Control', 'no-store, max-age=0');
      out.set('X-Robots-Tag', 'noindex, nofollow');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: out,
    });
  },
};
