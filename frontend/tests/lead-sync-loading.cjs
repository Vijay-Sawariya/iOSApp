const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

test('lead list snapshot renders while SQLite and the live detail request are still pending', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/leads/[id].tsx'), 'utf8');
  const start = source.indexOf('  const loadLead = async () =>');
  const end = source.indexOf('  const loadFollowups', start);
  let releaseDatabase, releaseNetwork, displayed, loading = true;
  const context = {
    leadRequest: { current: 0 }, id: '42', isOnline: true,
    api: { getLead: () => new Promise(resolve => { releaseNetwork = resolve; }) },
    cacheService: {
      getLead: async () => null,
      getClientLeads: async () => [{ id: 42, name: 'Cached lead' }],
      getInventoryLeads: async () => [],
    },
    syncService: { getLead: () => new Promise(resolve => { releaseDatabase = resolve; }) },
    setLead: data => { displayed = data; }, setLoading: value => { loading = value; },
    setError() {}, Alert: { alert() { assert.fail('Unexpected error'); } }, console,
  };
  vm.createContext(context);
  vm.runInContext(transpile(source.slice(start, end) + '\nglobalThis.load = loadLead;'), context);
  const completion = context.load();
  await settle();
  assert.equal(displayed.name, 'Cached lead');
  assert.equal(loading, false);
  releaseNetwork({ id: 42, name: 'Fresh lead' });
  await settle();
  releaseDatabase({ id: 42, name: 'Older database lead' });
  await completion;
  assert.equal(displayed.name, 'Fresh lead');
});

test('unknown and brief network transitions do not flash offline or trigger reconnect sync', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../contexts/OfflineContext.tsx'), 'utf8');
  const start = source.indexOf('  useEffect(', source.indexOf('// Network state listener'));
  const end = source.indexOf('  // Retry pending writes', start);
  let listener, cleanup, online = true, syncs = 0, sequence = 0;
  const timers = new Map();
  const context = {
    useEffect: fn => { cleanup = fn(); }, isInitialized: true, onlineRef: { current: true },
    NetInfo: { addEventListener: fn => { listener = fn; return () => {}; } },
    isNetworkReachable: state => state.isConnected === true && state.isInternetReachable !== false,
    setIsOnline: value => { online = value; }, runSync: async () => { syncs++; },
    setTimeout: fn => { timers.set(++sequence, fn); return sequence; },
    clearTimeout: id => timers.delete(id),
  };
  vm.runInNewContext(transpile(source.slice(start, end)), context);
  listener({ isConnected: null, isInternetReachable: null });
  assert.equal(online, true);
  listener({ isConnected: true, isInternetReachable: false });
  assert.equal(online, true);
  listener({ isConnected: true, isInternetReachable: true });
  assert.equal(timers.size, 0);
  assert.equal(syncs, 0);
  listener({ isConnected: false });
  [...timers.values()][0]();
  assert.equal(online, false);
  listener({ isConnected: true });
  assert.equal(online, true);
  assert.equal(syncs, 1);
  cleanup();
  assert.equal(timers.size, 0);
});
