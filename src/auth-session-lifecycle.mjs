// Browser request cancellation is local only. Server authorization remains the
// authority; aborting a request cannot undo an action already sent to a server.
export const AUTH_ORIGIN = 'https://mpcelmjiycjpdyyflisn.supabase.co';

export function createAuthLifecycle() {
  let current = null;
  const clear = () => {
    const previous = current;
    current = null;
    previous?.controller.abort();
  };
  return Object.freeze({
    clear,
    current: () => current?.attempt ?? null,
    begin() {
      clear();
      const controller = new AbortController();
      const entry = {controller, attempt: null};
      const isCurrent = () => current === entry && !controller.signal.aborted;
      entry.attempt = Object.freeze({
        signal: controller.signal,
        isCurrent,
        assertCurrent() {
          if (!isCurrent()) throw new Error('session_changed');
        },
      });
      current = entry;
      return entry.attempt;
    },
  });
}

export function isAuthToken(token) {
  return typeof token === 'string' && token.length >= 30
    && token.length <= 16384 && !/\s/.test(token);
}

export async function requestAuthJson(url, options, {
  attempt, timeoutMs = 10000, fetchImpl = globalThis.fetch,
} = {}) {
  attempt?.assertCurrent();
  if (!attempt || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000)
    throw new Error('auth_request_invalid');
  const destination = new URL(url);
  if (destination.origin !== AUTH_ORIGIN || destination.username
    || destination.password || destination.hash)
    throw new Error('auth_destination_invalid');
  const response = await fetchImpl(destination.href, {
    ...options, credentials: 'omit', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.any([attempt.signal, AbortSignal.timeout(timeoutMs)]),
  });
  // Also reject late bodies from transports/test doubles that ignore abort.
  attempt.assertCurrent();
  const data = await response.json().catch(() => null);
  attempt.assertCurrent();
  return {response, data};
}

export function authFailureMessage(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
    return 'The access check timed out. Please try again.';
  if (error?.status === 429)
    return 'Too many attempts. Please wait before trying again.';
  if (error?.status === 400 || error?.status === 401)
    return 'Sign-in could not be verified. Check your details and try again.';
  return 'Access could not be verified. Please try again when the service is available.';
}
