// One request budget covers authentication, fetches, body reads, retries, and queues.
// Aborting HTTP work does not claim that a database query was cancelled server-side.
export function createQaTransport({
  budgetMs = 24000,
  startedAt = performance.now(),
  now = () => performance.now(),
  fetchImpl = globalThis.fetch,
  requestSignal,
} = {}) {
  const controller = new AbortController();
  const deadline = startedAt + budgetMs;
  const attempts = [];
  const remaining = () => Math.max(0, deadline - now());
  const expire = () => controller.abort(new DOMException('QA deadline exceeded', 'TimeoutError'));
  const timer = setTimeout(expire, remaining());
  const stopped = () => {
    if (remaining() === 0 && !controller.signal.aborted) expire();
    return controller.signal.aborted || requestSignal?.aborted === true;
  };
  const unavailable = (error, started = false, latency_ms = 0) => ({
    ok: false, status: 0, body: null, started, latency_ms, error,
    deadline_exceeded: remaining() === 0 || controller.signal.aborted,
  });

  async function fetchProbe(url, timeout, options = {}, jsonOnly = false) {
    if (stopped()) return unavailable(requestSignal?.aborted ? 'qa_request_aborted' : 'qa_deadline_not_started');
    const began = now();
    const signals = [controller.signal, AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(timeout, remaining()))))];
    if (requestSignal) signals.push(requestSignal);
    const observation = {path: new URL(url).pathname, method: options.method || 'GET', status: 0};
    attempts.push(observation);
    try {
      const response = await fetchImpl(url, {
        ...options,
        headers: {Accept: jsonOnly ? 'application/json' : 'application/json,text/html',
          'User-Agent': 'THE-FATHER-ANALYTICS/174.0-QA', ...options.headers},
        cache: 'no-store', signal: AbortSignal.any(signals),
      });
      observation.status = response.status;
      // Body consumption stays under the same signal and deadline as the fetch.
      const body = jsonOnly || (response.headers.get('content-type') || '').includes('application/json')
        ? await response.json() : await response.text();
      if (stopped()) throw controller.signal.reason || new DOMException('QA request aborted', 'AbortError');
      return {ok: response.ok, status: response.status, body, started: true,
        latency_ms: now() - began, headers: {tfa_auth: response.headers.get('x-tfa-auth'),
          tfa_runtime: response.headers.get('x-tfa-runtime')}};
    } catch (error) {
      const reason = stopped() ? (requestSignal?.aborted ? 'qa_request_aborted' : 'qa_deadline_aborted')
        : String(error).slice(0, 160);
      observation.error = reason;
      return unavailable(reason, true, now() - began);
    } finally {
      observation.latency_ms = now() - began;
    }
  }

  async function retry(task, delay = 250) {
    const first = await task();
    if (first?.status > 0 && first.status < 500) return first;
    if (stopped() || remaining() <= delay + 1000) return {...first, retry_withheld: true};
    await new Promise(resolve => {
      const finish = () => {clearTimeout(wait); controller.signal.removeEventListener('abort', finish);
        requestSignal?.removeEventListener('abort', finish); resolve();};
      const wait = setTimeout(finish, delay);
      controller.signal.addEventListener('abort', finish, {once: true});
      requestSignal?.addEventListener('abort', finish, {once: true});
    });
    if (stopped() || remaining() <= 1000) return {...first, retry_withheld: true};
    return await task();
  }

  async function all(tasks, concurrency = 3) {
    const results = new Array(tasks.length);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= tasks.length) return;
        if (stopped()) {
          results[index] = unavailable(requestSignal?.aborted ? 'qa_request_aborted' : 'qa_deadline_not_started');
          continue;
        }
        try {results[index] = await tasks[index]();}
        catch (error) {results[index] = unavailable(String(error).slice(0, 160));}
      }
    };
    const workerCount = Math.max(1, Math.min(3, Math.floor(concurrency) || 1, tasks.length));
    await Promise.all(Array.from({length: workerCount}, () => worker()));
    return results;
  }

  return {
    any: (url, timeout = 10000) => fetchProbe(url, timeout),
    json: (url, timeout = 10000) => fetchProbe(url, timeout, {}, true),
    post: (url, body, timeout = 10000) => fetchProbe(url, timeout,
      {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body ?? {})}, true),
    retry, all,
    summary(probes) {
      const notStarted = probes.filter(probe => probe.started === false).length;
      const deadlineAborted = probes.filter(probe => probe.started && probe.deadline_exceeded).length;
      const requestAborted = requestSignal?.aborted === true;
      return {budget_ms: budgetMs, elapsed_ms: Math.round(now() - startedAt), concurrency_limit: 3,
        planned_probes: probes.length, started_probes: probes.length - notStarted,
        not_started_probes: notStarted, deadline_aborted_probes: deadlineAborted,
        deadline_exceeded: remaining() === 0 || controller.signal.aborted, request_aborted: requestAborted,
        incomplete: notStarted > 0 || deadlineAborted > 0 || requestAborted,
        http_attempts: attempts.length, attempts: attempts.map(row => ({...row}))};
    },
    close: () => clearTimeout(timer),
  };
}
