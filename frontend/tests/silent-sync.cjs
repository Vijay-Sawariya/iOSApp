const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function syncHost(outcome) {
  const source = fs.readFileSync(path.join(__dirname, '../contexts/OfflineContext.tsx'), 'utf8');
  const start = source.indexOf('  const runSync =');
  const end = source.indexOf('  const triggerSync', start);
  const progress = [], errors = [];
  let calls = 0;
  const context = {
    useCallback: fn => fn, AppState: { currentState: 'active' }, getAuthToken: () => 'token',
    syncingRef: { current: false }, nextAutomaticAttempt: { current: 0 }, automaticFailures: { current: 0 },
    setIsAutomaticSync() {}, setIsSyncing() {}, setLastSyncTime() {},
    setSyncProgress: value => progress.push(value), setSyncError: value => errors.push(value),
    console: { log() {}, error() {} },
    syncService: {
      fullSync: async callback => {
        calls++;
        callback?.({ stage: 'Downloading', progress: 1, total: 4 });
        if (outcome === 'throw') throw new Error('Network timeout');
        return outcome === 'failure' ? { success: false, error: 'Network timeout' } : { success: true };
      },
      getPendingSyncError: async () => outcome === 'pending' ? 'Queued edit needs retry' : null,
      getLastSyncTime: async () => new Date(),
    },
  };
  const code = ts.transpileModule(source.slice(start, end) + '\nglobalThis.run = runSync;', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, context);
  return { context, progress, errors, calls: () => calls };
}

for (const outcome of ['success', 'failure', 'throw', 'pending']) {
  test(`automatic sync stays silent on ${outcome}`, async () => {
    const h = syncHost(outcome);
    await h.context.run(true);
    assert.equal(h.calls(), 1);
    assert.ok(h.progress.every(value => value === null));
    assert.ok(h.errors.every(value => value === null));
    assert.equal(h.context.syncingRef.current, false);
    assert.ok(h.context.nextAutomaticAttempt.current > Date.now());
  });
}

test('manual sync keeps progress and actionable failure feedback', async () => {
  const h = syncHost('failure');
  await h.context.run(false);
  assert.ok(h.progress.some(value => value?.stage === 'Downloading'));
  assert.ok(h.errors.includes('Network timeout'));
});

test('automatic failures retain retry backoff', async () => {
  const h = syncHost('failure');
  await h.context.run(true);
  await h.context.run(true);
  assert.equal(h.calls(), 1);
  h.context.nextAutomaticAttempt.current = 0;
  await h.context.run(true);
  assert.equal(h.calls(), 2);
});

function renderSyncUi(state) {
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect() {},
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../components/OfflineBanner.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    if (name === 'react') return react;
    if (name === 'react-native') return { View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: value => value } };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0 }) };
    if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (name === '../constants/theme') return { colors: {}, radii: {} };
    if (name === '../contexts/OfflineContext') return { useOffline: () => ({ isOnline: true, formatLastSync: () => 'Recently', triggerSync() {}, ...state }) };
    throw new Error(name);
  } });
  return { banner: exports.OfflineBanner(), button: exports.SyncButton() };
}

test('automatic activity and errors render no banner or Sync Now spinner', () => {
  for (const isSyncing of [true, false]) {
    const ui = renderSyncUi({ isSyncing, isAutomaticSync: true, syncError: 'Timeout', syncProgress: { stage: 'Downloading' } });
    assert.equal(ui.banner, null);
    assert.ok(!JSON.stringify(ui.button).includes('ActivityIndicator'));
    assert.ok(!JSON.stringify(ui.button).includes('Syncing...'));
    assert.ok(JSON.stringify(ui.button).includes('Sync Now'));
  }
});

test('manual activity, manual failure, and actual offline state remain visible', () => {
  assert.ok(JSON.stringify(renderSyncUi({ isSyncing: true, isAutomaticSync: false, syncProgress: { stage: 'Downloading' } })).includes('ActivityIndicator'));
  assert.ok(JSON.stringify(renderSyncUi({ isSyncing: false, isAutomaticSync: false, syncError: 'Timeout' }).banner).includes('tap to retry'));
  assert.ok(JSON.stringify(renderSyncUi({ isOnline: false, isAutomaticSync: true }).banner).includes('You are offline'));
});
