const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

function setup(operations, send) {
  let pending = structuredClone(operations);
  const errors = [];
  const db = {
    getPendingOperations: async () => structuredClone(pending),
    getPendingOperationCount: async () => pending.length,
    deletePendingOperation: async id => { pending = pending.filter(op => op.id !== id); },
    markPendingOperationError: async (id, message) => errors.push({ id, message }),
    resolvePendingCreate: async (id, entity, localId, serverId) => {
      pending = pending.filter(op => op.id !== id).map(op => {
        if (op.entity_type !== entity || op.local_entity_id !== localId) return op;
        return { ...op, local_entity_id: serverId, payload: JSON.stringify({ ...JSON.parse(op.payload), id: serverId }) };
      });
    },
    removeLocalLead: async () => {}, saveLeads: async () => {}, saveFloorPricing: async () => {},
    saveBuilders: async () => {}, updateLastSyncTime: async () => {},
  };
  const exports = {};
  const mocks = {
    '@react-native-community/netinfo': { default: { fetch: async () => ({ isConnected: true }) } },
    './database': db,
    './api': { getAuthToken: () => 'token', fetchWithTimeout: send },
    '../constants/config': { API_URL: 'https://test' },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/syncService.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: name => mocks[name], console: { error() {} } });
  return { service: exports.syncService, pending: () => pending, errors };
}
const operation = (id, type, localId, data) => ({ id, entity_type: 'lead', operation_type: type, local_entity_id: localId, payload: JSON.stringify(data) });
const ok = data => ({ ok: true, json: async () => data });

test('failed create retains its edits while independent inventory uploads continue', async () => {
  const calls = [];
  const s = setup([
    operation(1, 'create', -1, { name: 'invalid' }),
    operation(2, 'update', -1, { id: -1, data: { name: 'edit' } }),
    operation(3, 'create', -2, { name: 'valid' }),
  ], async (url, request) => {
    calls.push(url);
    return JSON.parse(request.body).name === 'invalid' ? { ok: false, status: 422 } : ok({ id: 22 });
  });
  assert.equal((await s.service.fullSync()).success, false);
  assert.deepEqual(s.pending().map(op => op.id), [1, 2]);
  assert.equal(calls.length, 2);
});

test('dependent edit retains server id after failure and retries without recreating inventory', async () => {
  let fail = true;
  let creates = 0;
  const urls = [];
  const s = setup([
    operation(1, 'create', -1, { name: 'property' }),
    operation(2, 'update', -1, { id: -1, data: { name: 'edited' } }),
  ], async (url, request) => {
    urls.push(url);
    if (request.method === 'POST') { creates++; return ok({ id: 42 }); }
    if (request.method === 'PUT' && fail) throw new Error('connection lost');
    return ok(request.method === 'PUT' ? { id: 42 } : []);
  });
  assert.equal((await s.service.fullSync()).success, false);
  assert.equal(JSON.parse(s.pending()[0].payload).id, 42);
  fail = false;
  assert.equal((await s.service.fullSync()).success, true);
  assert.equal(s.pending().length, 0);
  assert.equal(creates, 1);
  assert.equal(urls.filter(url => url.endsWith('/leads/42')).length, 2);
});

test('simultaneous sync triggers upload a queued create once', async () => {
  let creates = 0;
  const s = setup([operation(1, 'create', -1, { name: 'property' })], async (url, request) => {
    if (request.method === 'POST') { creates++; return ok({ id: 42 }); }
    return ok([]);
  });
  await Promise.all([s.service.fullSync(), s.service.fullSync()]);
  assert.equal(creates, 1);
});
