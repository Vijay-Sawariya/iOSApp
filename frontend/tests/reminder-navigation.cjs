const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

test('notification navigates to its reminder while the server action is still pending', async () => {
  const effects = [];
  const routes = [];
  let callback;
  let finishUpdate;
  const serverUpdate = new Promise(resolve => { finishUpdate = resolve; });
  const react = { useEffect: fn => effects.push(fn), useRef: value => ({ current: value }), createElement: () => null };
  const mocks = {
    react,
    'react-native': { Alert: { alert() {} }, StyleSheet: { create: value => value }, AppState: { addEventListener: () => ({ remove() {} }) } },
    'expo-router': { Stack: { Screen: () => null }, usePathname: () => '/dashboard', router: { navigate: route => routes.push(route) } },
    '../contexts/AuthContext': { useAuth: () => ({ token: 'test', user: { role: 'admin' }, loading: false, hasFeature: () => true }) },
    '../contexts/OfflineContext': { useOffline: () => ({ isInitialized: true }) },
    '../components/OfflineBanner': {},
    '../services/api': { setAuthToken() {}, api: { getReminders: async () => [] } },
    '../services/notificationService': { notificationService: {
      configureReminderActions: async () => {},
      getLastNotificationResponse: async () => null,
      clearLastNotificationResponse: async () => {},
      syncAssignedReminderNotifications: async () => {},
      handleReminderNotificationResponse: () => serverUpdate,
      addNotificationResponseReceivedListener: listener => { callback = listener; return { remove() {} }; },
    } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../app/_layout.tsx'), 'utf8') + '\nexports.testRoot = RootLayoutContent;';
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, { exports, require: name => mocks[name], console });
  exports.testRoot();
  effects[0]();
  const cleanup = effects[1]();
  const pending = callback({ actionIdentifier: 'reminder-stop', notification: { request: {
    identifier: 'notification-42', content: { data: { type: 'reminder', reminderId: '42' } },
  } } });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].pathname, '/reminders/edit/[id]');
  assert.equal(routes[0].params.id, '42');
  finishUpdate('stopped');
  await pending;
  assert.equal(routes.length, 1);
  cleanup();
});
