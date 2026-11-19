/* eslint-env node */
// V-11 and V-12: rate-limit and timeout messages from the real API client; one retry for a busy server.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const compile = file => ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const apiSource = compile('services/api.ts');
const headers = values => ({ get: name => values[name.toLowerCase()] ?? null });

function client(protectedFetch, { fastAssistantDeadline = false } = {}) {
  const stored = new Map([['vitaltrack_access_token', 'access'], ['vitaltrack_refresh_token', 'refresh']]);
  const mod = { exports: {} };
  vm.runInNewContext(apiSource, {
    exports: mod.exports, module: mod, process: { env: {} }, __DEV__: false, AbortController, TypeError, Date, Map, clearTimeout,
    setTimeout: (fn, ms) => setTimeout(fn, fastAssistantDeadline && ms === 70_000 ? 5 : ms),
    fetch: async (url, options) => protectedFetch(url, options),
    require: name => {
      if (name === 'expo-secure-store') return { getItemAsync: async key => stored.get(key) || null, setItemAsync: async (key, value) => stored.set(key, value), deleteItemAsync: async key => stored.delete(key) };
      if (name === '@/utils/logger') return { logger: new Proxy({}, { get: () => () => {} }) };
      if (name === '@/store/useAuthStore') return { useAuthStore: { getState: () => ({ isAuthenticated: false }) } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: 'api.ts' });
  return mod.exports;
}
const rateLimited = (retryAfter, detail, errorCode) => ({ status: 429, ok: false,
  headers: headers({ 'content-type': 'application/json', ...(errorCode ? { 'x-ai-error': errorCode } : {}), ...(retryAfter === undefined ? {} : { 'retry-after': String(retryAfter) }) }),
  json: async () => (detail === undefined ? {} : { detail }) });

test('V-11: a busy 429 keeps the server wording and a short wait in seconds', async () => {
  const { api } = client(async () => rateLimited(5, 'AI is busy. Please try again shortly.', 'busy'));
  await assert.rejects(api.assistantRequest('/ai/interpret', { method: 'POST' }, () => {}), error =>
    error.status === 429 && error.data.retryAfter === 5 && error.data.errorCode === 'busy' && error.message === 'AI is busy. Please try again shortly. Try again in 5 seconds.');
});

test('V-11: a daily-allowance 429 names a clock time, not thousands of seconds', async () => {
  const { api, rateLimitMessage } = client(async () => rateLimited(19_800, "Today's AI allowance is used. It resets at 00:00 UTC."));
  await assert.rejects(api.assistantRequest('/ai/speak', { method: 'POST' }, () => {}), error =>
    error.status === 429 && error.data.retryAfter === 19_800 && /^Today's AI allowance is used\. It resets at 00:00 UTC\. Try again after .+\.$/.test(error.message) && !/19800|seconds/.test(error.message));
  assert.equal(rateLimitMessage('', null), 'Too many requests right now.');
  assert.equal(rateLimitMessage('', 1), 'Too many requests right now. Try again in 1 second.');
});

test('V-11: Retry-After accepts seconds or an HTTP date and ignores junk', () => {
  const { retryAfterSeconds } = client(async () => rateLimited());
  const now = Date.parse('2026-10-15T10:00:00Z');
  assert.equal(retryAfterSeconds('30', now), 30);
  assert.equal(retryAfterSeconds('Thu, 15 Oct 2026 10:01:00 GMT', now), 60);
  assert.equal(retryAfterSeconds('soon', now), null);
  assert.equal(retryAfterSeconds('', now), null);
  assert.equal(retryAfterSeconds(null, now), null);
});

test('V-12: an assistant request that outlives its deadline says so; a user cancel stays silent', async () => {
  const stalled = (_, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))));
  const timed = client(stalled, { fastAssistantDeadline: true });
  await assert.rejects(timed.api.assistantRequest('/ai/capabilities', { method: 'GET' }, () => {}), error =>
    error.status === 0 && error.data.originalError === 'request_timeout' && /took too long to answer/.test(error.message));
  const cancelled = client(stalled);
  const controller = new AbortController();
  const pending = cancelled.api.assistantRequest('/ai/capabilities', { method: 'GET', signal: controller.signal }, () => {});
  controller.abort();
  await assert.rejects(pending, error => /^Request cancelled/.test(error.message) && error.status !== 0);
});

function service(assistantRequest) {
  const mod = { exports: {} };
  vm.runInNewContext(compile('services/assistant.ts'), { module: mod, exports: mod.exports, setTimeout, clearTimeout, FormData: class { append() {} },
    require: name => ({ './api': { api: { assistantRequest } }, './assistantSession': { assertSession() {} },
      '@/features/assistant/contracts': { validatePlan: x => x, validateSpecification: x => x }, '@/features/assistant/core': { validateIntent: x => x } })[name] });
  return mod.exports;
}
const busy = retryAfter => Object.assign(new Error('AI is busy.'), { status: 429, data: { retryAfter, errorCode: 'busy' } });

test('V-11: understanding and listening retry once after a short busy answer; speech never retries', async () => {
  let calls = 0;
  const plan = service(async () => { calls++; if (calls === 1) throw busy(0); return { version: 3 }; });
  assert.deepEqual(await plan.interpretPlan({ owner: 'a' }, 'Show low stock', false, new AbortController().signal), { version: 3 });
  assert.equal(calls, 2);

  calls = 0;
  const longWait = service(async () => { calls++; throw busy(3600); });
  await assert.rejects(longWait.interpretPlan({ owner: 'a' }, 'Show low stock', false, new AbortController().signal), /AI is busy/);
  assert.equal(calls, 1, 'a daily allowance is not retried');

  calls = 0;
  const twice = service(async () => { calls++; throw busy(0); });
  await assert.rejects(twice.transcribe({ owner: 'a' }, 'file:///take.wav', new AbortController().signal), /AI is busy/);
  assert.equal(calls, 2, 'only one retry');

  calls = 0;
  const speech = service(async () => { calls++; throw busy(0); });
  await assert.rejects(speech.speak({ owner: 'a' }, 'Short answer.', new AbortController().signal, 'sarvam'), /AI is busy/);
  assert.equal(calls, 1, 'speech may be billed, so it is never retried automatically');
});

test('daily, generic and older-server 429s never retry even when the wait is short', async () => {
  for (const error of [
    Object.assign(new Error("Today's AI allowance is used."), { status: 429, data: { retryAfter: 0 } }),
    Object.assign(new Error('AI is busy.'), { status: 429, data: { retryAfter: 0 } }),
    Object.assign(new Error('Rate limit exceeded'), { status: 429, data: { retryAfter: 0, errorCode: 'rate_limit' } }),
    Object.assign(new Error('AI is busy.'), { status: 503, data: { retryAfter: 0, errorCode: 'busy' } }),
  ]) {
    let calls = 0;
    const api = service(async () => { calls++; throw error; });
    await assert.rejects(api.interpretPlan({ owner: 'a' }, 'Stock', false, new AbortController().signal), value => value === error);
    assert.equal(calls, 1);
  }
});

test('a generic SlowAPI response keeps its explanation without inventing a retry time', async () => {
  const { api } = client(async () => ({ ...rateLimited(), json: async () => ({ error: 'Rate limit exceeded: 30 per 1 minute' }) }));
  await assert.rejects(api.assistantRequest('/ai/sarvam-key', { method: 'GET' }, () => {}), error =>
    error.status === 429 && error.message === 'Rate limit exceeded: 30 per 1 minute' && error.data.retryAfter === null && error.data.errorCode === undefined);
});

test('the API exposes a busy marker on a 503 without turning it into a retriable 429', async () => {
  const { api } = client(async () => ({ ...rateLimited(5, 'AI is busy.', 'busy'), status: 503 }));
  await assert.rejects(api.assistantRequest('/ai/interpret', { method: 'POST' }, () => {}), error =>
    error.status === 503 && error.data.errorCode === 'busy' && error.message === 'AI is busy.');
});

test('cancelling during the busy wait prevents a second upload', async () => {
  let calls = 0;
  const api = service(async () => { calls++; throw busy(5); });
  const abort = new AbortController();
  const pending = api.transcribe({ owner: 'a' }, 'file:///take.wav', abort.signal);
  await new Promise(resolve => setImmediate(resolve));
  abort.abort();
  await assert.rejects(pending, /Request cancelled/);
  assert.equal(calls, 1);
});
