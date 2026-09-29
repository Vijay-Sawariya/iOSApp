const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function setup() {
  let calls = 0;
  let now = 1000;
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../services/api.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports, require: () => ({}), console: { log() {} }, URLSearchParams,
    AbortController, setTimeout, clearTimeout, Date: { now: () => now },
    fetch: async () => { calls++; return { ok: true, json: async () => ({ version: calls }) }; },
  });
  return { ...exports, calls: () => calls, advance: () => { now += 31000; } };
}

test('performance shares pending requests and briefly reuses identical reports', async () => {
  const s = setup();
  await Promise.all([s.api.getMobilePerformance(30, 1), s.api.getMobilePerformance(30, 1)]);
  assert.equal(s.calls(), 1);
  await s.api.getMobilePerformance(30, 1);
  assert.equal(s.calls(), 1);
  s.advance();
  await s.api.getMobilePerformance(30, 1);
  assert.equal(s.calls(), 2);
});

test('performance separates filters and details, forces refresh, and clears on account change', async () => {
  const s = setup();
  s.setAuthToken('first');
  await s.api.getMobilePerformance(30, 1);
  await s.api.getMobilePerformance(7, 1);
  await s.api.getMobilePerformance(30, 2);
  await s.api.getMobilePerformance(30, 1, 'portfolio');
  assert.equal(s.calls(), 4);
  await s.api.getMobilePerformance(30, 1, undefined, true);
  assert.equal(s.calls(), 5);
  s.setAuthToken('second');
  await s.api.getMobilePerformance(30, 1);
  assert.equal(s.calls(), 6);
});
