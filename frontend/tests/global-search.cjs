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
test('global search progressively returns record details and isolates failed sources', async () => {
  const updates = [];
  const api = setup(async url => ({ ok: true, json: async () => {
    if (url.includes('sources_only')) return { sources: [{ key: 'monthly', label: 'Monthly' }, { key: 'clients', label: 'Clients' }] };
    if (url.includes('source=clients')) throw new Error('Connection failed');
    return { groups: { monthly: { label: 'Monthly', total: 1, items: [{ row: { id: 18, address: 'F-18', owner_name: 'Owner' }, url: '/monthly-inventory?entry_id=18' }] } }, errors: [] };
  } }));
  const result = await api.globalSearch('F-18', false, 1, '', data => updates.push(data));
  assert.equal(result.groups.monthly.items[0].row.address, 'F-18');
  assert.equal(result.groups.monthly.items[0].row.owner_name, 'Owner');
  assert.equal(updates.length, 2);
  assert.match(result.errors[0], /Clients: Connection failed/);
});
test('search cancellation prevents queued sources from being requested', async () => {
  const controller = new AbortController();
  let calls = 0;
  const api = setup(async () => {
    calls++;
    controller.abort();
    return { ok: true, json: async () => ({ sources: Array.from({length: 8}, (_, i) => ({ key: String(i) })) }) };
  });
  await api.globalSearch('R-50', false, 1, '', undefined, controller.signal);
  assert.equal(calls, 1);
});
