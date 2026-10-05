const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function setup(response = { ok: true, json: async () => ({ id: 1 }) }) {
  const exports = {}; const requests = [];
  const cacheService = new Proxy({}, { get() { throw new Error('Form reads must not wait for cache or connectivity probes'); } });
  const source = fs.readFileSync(path.join(__dirname, '../services/api.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: name => name === './cacheService' ? { cacheService } : { API_URL: 'https://api.example' },
    console: { log() {} }, AbortController, setTimeout, clearTimeout, URLSearchParams,
    fetch: async (url, options) => { requests.push({ url, options }); return response; },
  });
  return { ...exports, requests };
}

test('edit and inventory popup use fresh direct reads without disk or connectivity waits', async () => {
  const s = setup();
  await s.api.getLeadEditData('1');
  await s.api.getLeadEditData('1');
  await s.api.getInventoryUpdate(1);
  assert.equal(s.requests.length, 3);
  assert.ok(s.requests[0].url.includes('/leads/1/edit-data?_refresh='));
  assert.ok(s.requests[2].url.includes('/leads/1/inventory-update?_refresh='));
  assert.ok(s.requests.every(r => r.options.signal instanceof AbortSignal));
});

test('offline mode never opens an editable form from cached data', async () => {
  const s = setup(); s.setOfflineMode(true);
  await assert.rejects(s.api.getLeadEditData('1'), /online connection/);
  await assert.rejects(s.api.getInventoryUpdate(1), /online connection/);
  assert.equal(s.requests.length, 0);
});

test('authorization failures propagate instead of falling back to old lead data', async () => {
  const s = setup({ ok: false, status: 403, json: async () => ({ detail: 'Access revoked' }) });
  await assert.rejects(s.api.getLeadEditData('1'), /Access revoked/);
  await assert.rejects(s.api.getInventoryUpdate(1), /Access revoked/);
});
