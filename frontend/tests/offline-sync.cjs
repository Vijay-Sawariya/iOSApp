const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

function setup(operations, send, lastSync = null) {
  let pending = structuredClone(operations);
  const errors = [];
  const db = {
    getPendingOperations: async () => structuredClone(pending),
    getPendingOperationCount: async () => pending.length,
    deletePendingOperation: async id => { pending = pending.filter(op => op.id !== id); },
    markPendingOperationError: async (id, message) => { errors.push({ id, message }); pending.find(op => op.id === id).last_error = message; },
    resolvePendingCreate: async (id, entity, localId, serverId) => {
      pending = pending.filter(op => op.id !== id).map(op => {
        if (op.entity_type !== entity || op.local_entity_id !== localId) return op;
        return { ...op, local_entity_id: serverId, payload: JSON.stringify({ ...JSON.parse(op.payload), id: serverId }) };
      });
    },
    removeLocalLead: async () => {}, saveLeads: async () => {}, saveFloorPricing: async () => {},
    saveBuilders: async () => {},
    getLastSyncTime: async () => lastSync,
    updateLastSyncTime: async () => { lastSync = new Date(); },
  };
  const exports = {};
  const policy = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/syncRetryPolicy.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: policy });
  const mocks = {
    './syncRetryPolicy': policy,
    '@react-native-community/netinfo': { default: { fetch: async () => ({ isConnected: true }) } },
    './database': db,
    './api': { getAuthToken: () => 'token', fetchWithTimeout: send },
    '../constants/config': { API_URL: 'https://test' },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/syncService.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: name => mocks[name], console: { error() {} } });
  return { policy, service: exports.syncService, pending: () => pending, errors };
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


test('404 pauses automatic retries across restarts, retains data, and allows manual recovery', async () => {
  let requests = 0;
  const send = async () => { requests++; return { ok: false, status: 404, json: async () => ({ detail: 'Lead not found' }) }; };
  const s = setup([operation(1, 'update', 42, { id: 42, data: { name: 'Saved edit' } })], send);
  await s.service.fullSync(undefined, true, true);
  assert.equal(requests, 1);
  assert.equal(await s.service.hasPendingOperations(true), false);
  assert.match(await s.service.getPendingSyncError(), /Lead not found/);
  const restarted = setup(s.pending(), async (url, request) => { requests++; return ok(request.method ? { id: 42 } : []); });
  assert.equal(await restarted.service.hasPendingOperations(true), false);
  await restarted.service.fullSync();
  assert.equal(restarted.pending().length, 0);
});

test('transient retries back off and legacy 404 items stay preserved for manual retry', () => {
  const { policy } = setup([], async () => ok([]));
  let previous;
  for (const delay of [30000, 60000, 120000, 240000, 480000, 900000, 900000]) {
    const failure = policy.createSyncFailure({ message: 'Unavailable', status: 503 }, previous, 1000);
    previous = JSON.stringify(failure);
    assert.equal(failure.retryAfter, 1000 + delay);
    assert.equal(policy.canAutomaticallyRetry(previous, 1000 + delay - 1), false);
    assert.equal(policy.canAutomaticallyRetry(previous, 1000 + delay), true);
  }
  assert.equal(policy.canAutomaticallyRetry('API error: 404'), false);
});


test('automatic reconnects reuse a recent full sync, while manual refresh bypasses freshness', async () => {
  const urls = [];
  const s = setup([], async url => { urls.push(url); return ok([]); }, new Date());
  assert.equal((await s.service.fullSync(undefined, true, true)).success, true);
  assert.equal((await s.service.fullSync(undefined, true, true)).success, true);
  assert.equal(urls.length, 0);
  assert.equal((await s.service.fullSync()).success, true);
  assert.equal(urls.length, 3);
});

test('queued edits upload promptly without redownloading fresh lists', async () => {
  const calls = [];
  const s = setup([operation(1, 'update', 42, { id: 42, data: { name: 'edited' } })], async (url, request) => {
    calls.push(request.method);
    return ok({ id: 42 });
  }, new Date());
  assert.equal((await s.service.fullSync(undefined, true, true)).success, true);
  assert.deepEqual(calls, ['PUT']);
  assert.equal(s.pending().length, 0);
});

test('stale and never-synced data refresh once, then reuse the completed snapshot', async () => {
  for (const lastSync of [null, new Date(Date.now() - 5 * 60 * 60 * 1000)]) {
    let calls = 0;
    const s = setup([], async () => { calls++; return ok([]); }, lastSync);
    assert.equal((await s.service.fullSync(undefined, true, true)).success, true);
    assert.equal(calls, 3);
    assert.equal((await s.service.fullSync(undefined, true, true)).success, true);
    assert.equal(calls, 3);
  }
});


test('automatic full sync waits five hours even across repeated reconnects', async () => {
  for (const ageMinutes of [30, 60, 240, 299]) {
    let requests = 0;
    const s = setup([], async () => { requests++; return ok([]); }, new Date(Date.now() - ageMinutes * 60 * 1000));
    assert.equal((await s.service.fullSync(undefined, true, true)).success, true);
    assert.equal((await s.service.fullSync(undefined, true, true)).success, true);
    assert.equal(requests, 0, `Unexpected full sync after ${ageMinutes} minutes`);
  }
});
