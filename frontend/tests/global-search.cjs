const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function setup(fetch) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../services/api.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: () => ({}), fetch, Error, AbortController, setTimeout, clearTimeout, console, URLSearchParams });
  return exports.api;
}
test('global search uses one authenticated request and retains successful details with source failures', async () => {
  const calls = [], updates = [];
  const api = setup(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ groups: {
      monthly: { label: 'Monthly', total: 1, items: [{ row: { id: 18, address: 'F-18', owner_name: 'Owner' }, url: '/monthly-inventory?entry_id=18' }] },
    }, errors: ['Clients'], timings_ms: { monthly: 12 } }) };
  });
  const result = await api.globalSearch('F-18', false, 1, '', data => updates.push(data));
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].url.includes('sources_only'));
  assert.equal(result.groups.monthly.items[0].row.address, 'F-18');
  assert.equal(result.groups.monthly.items[0].row.owner_name, 'Owner');
  assert.equal(updates.length, 1);
  assert.equal(result.errors[0], 'Clients');
});
test('source pagination stays a single request and forwards cancellation', async () => {
  const controller = new AbortController();
  let calls = 0;
  const api = setup(async (url, {signal}) => {
    calls++;
    assert.match(url, /page=2&source=monthly/);
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled'))));
  });
  const pending = api.globalSearch('R-50', false, 2, 'monthly', undefined, controller.signal);
  controller.abort();
  await assert.rejects(pending, /Cancelled/);
  assert.equal(calls, 1);
});
