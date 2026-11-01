const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function setup(fetch) {
  const listeners = new Set();
  const AppState = { currentState: 'active', addEventListener: (_, fn) => {
    listeners.add(fn); return { remove: () => listeners.delete(fn) };
  } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../services/api.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: name => name === 'react-native' ? { AppState } : {},
    fetch, AbortController, setTimeout, clearTimeout, console, URLSearchParams });
  return { ...exports, state(value) {
    AppState.currentState = value;
    for (const fn of [...listeners]) fn(value);
  }, listeners };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('a locked read waits for unlock and retries with a fresh signal', async () => {
  let calls = 0;
  const response = { ok: true };
  const s = setup((url, { signal }) => {
    if (++calls > 1) return Promise.resolve(response);
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Network request failed'))));
  });
  const pending = s.fetchWithTimeout('/read');
  await settle();
  s.state('background');
  await settle();
  assert.equal(calls, 1);
  s.state('active');
  assert.equal(await pending, response);
  assert.equal(calls, 2);
  assert.equal(s.listeners.size, 0);
});

test('an interrupted write is never automatically resent', async () => {
  let calls = 0, fail;
  const s = setup(() => { calls++; return new Promise((resolve, reject) => { fail = reject; }); });
  const pending = s.fetchWithTimeout('/write', { method: 'POST' });
  const rejected = assert.rejects(pending, /Check whether your changes were saved/);
  await settle();
  s.state('background');
  fail(new Error('Network request failed'));
  await settle();
  s.state('active');
  await rejected;
  assert.equal(calls, 1);
  assert.equal(s.listeners.size, 0);
});

test('timeouts have a useful message and release lifecycle listeners', async () => {
  const s = setup((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  await assert.rejects(s.fetchWithTimeout('/slow', {}, 1), /server took too long/);
  assert.equal(s.listeners.size, 0);
});
