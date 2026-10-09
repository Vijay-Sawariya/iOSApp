const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('idle with an empty queue does not sync; timers stop in background and pending writes resume', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../contexts/OfflineContext.tsx'), 'utf8');
  const start = source.indexOf('  useEffect(', source.indexOf('// Retry pending writes'));
  const end = source.indexOf('\n  return (', start);
  const intervals = new Map();
  let sequence = 0, checks = 0, syncs = 0, pending = false, listener, cleanup;
  const appState = { currentState: 'active', addEventListener: (_, fn) => { listener = fn; return { remove() {} }; } };
  const context = {
    AUTOMATIC_SYNC_INTERVAL_MS: 5 * 60 * 60 * 1000,
    useEffect: fn => { cleanup = fn(); }, isInitialized: true, lastSyncTime: new Date(),
    AppState: appState, getAuthToken: () => 'test', syncingRef: { current: false }, nextAutomaticAttempt: { current: 0 },
    syncService: { hasPendingOperations: async () => { checks++; return pending; } },
    runSync: async () => { syncs++; },
    setInterval: fn => { intervals.set(++sequence, fn); return sequence; },
    clearInterval: id => intervals.delete(id), console,
  };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  await settle();
  for (let i = 0; i < 10; i++) { [...intervals.values()][0](); await settle(); }
  assert.equal(checks, 11);
  assert.equal(syncs, 0);
  appState.currentState = 'background'; listener('background');
  assert.equal(intervals.size, 0);
  pending = true;
  appState.currentState = 'inactive'; listener('inactive');
  appState.currentState = 'active'; listener('active');
  await settle();
  assert.equal(syncs, 1);
  assert.equal(intervals.size, 1);
  cleanup();
  assert.equal(intervals.size, 0);
});

test('reminder background refresh coalesces lifecycle events and respects its cooldown', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/_layout.tsx'), 'utf8');
  const start = source.indexOf('  useEffect(() => {\n    if (!notificationReady)');
  const end = source.indexOf('\n\n  useEffect', start);
  let listener, cleanup, calls = 0, release, now = 1000, scheduled = 0;
  const response = new Promise(resolve => { release = resolve; });
  const appState = { currentState: 'active', addEventListener: (_, fn) => { listener = fn; return { remove() {} }; } };
  const context = {
    useEffect: fn => { cleanup = fn(); }, notificationReady: true, token: 'test',
    AppState: appState, Date: { now: () => now }, console,
    api: { getReminders: async () => { calls++; return response; } },
    notificationService: {
      configureReminderActions: async () => {}, getLastNotificationResponse: async () => null,
      addNotificationResponseReceivedListener: () => ({ remove() {} }),
      syncAssignedReminderNotifications: async () => { scheduled++; },
    },
  };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  await settle();
  const resume = () => {
    for (const state of ['background', 'inactive', 'active']) { appState.currentState = state; listener(state); }
  };
  resume(); resume();
  await settle();
  assert.equal(calls, 1);
  release([]); await settle();
  assert.equal(scheduled, 1);
  resume(); await settle();
  assert.equal(calls, 1);
  now += 60001; resume(); await settle();
  assert.equal(calls, 2);
  cleanup();
});
