const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

function setup() {
  const storage = new Map();
  const scheduled = new Map();
  const updates = [];
  let category;
  let count = 0;
  const now = Date.parse('2026-09-18T20:30:25Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const notifications = {
    setNotificationHandler() {},
    AndroidNotificationPriority: { MAX: 2 },
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
    async setNotificationCategoryAsync(id, actions) { category = actions; },
    async getAllScheduledNotificationsAsync() { return [...scheduled.values()]; },
    async cancelScheduledNotificationAsync(id) { scheduled.delete(id); },
    async scheduleNotificationAsync(request) {
      const identifier = String(++count);
      scheduled.set(identifier, { ...request, identifier });
      return identifier;
    },
  };
  const mocks = {
    'expo-notifications': notifications,
    'expo-device': { isDevice: true },
    'react-native': { Platform: { OS: 'ios' }, Alert: {} },
    '@react-native-async-storage/async-storage': {
      async getItem(key) { return storage.get(key) || null; },
      async setItem(key, value) { storage.set(key, value); },
    },
    './api': { api: { async updateReminder(id, data) { updates.push({ id, ...data }); } } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../services/notificationService.ts'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText,
    { exports, require: name => mocks[name], Date: Clock, console: { log() {}, warn() {}, error() {} } });
  return { ...exports, scheduled, updates, now, getCategory: () => category };
}

function response(actionIdentifier) {
  return { actionIdentifier, notification: { request: { identifier: 'delivered', content: {
    data: { type: 'reminder', reminderId: '42', title: 'Call client' },
  } } } };
}

for (const action of ['reminder-snooze-6h', 'reminder-snooze-1h']) {
  test(`${action} replaces hourly alerts with a six-hour delay`, async () => {
    const ctx = setup();
    ctx.scheduled.set('old', { identifier: 'old', content: { data: { reminderId: '42' } } });
    assert.equal(await ctx.notificationService.handleReminderNotificationResponse(response(action)), 'snoozed');
    assert.equal(ctx.scheduled.has('old'), false);
    assert.equal(ctx.scheduled.size, 24);
    const resumeAt = Date.parse(ctx.updates[0].reminder_date + '+05:30');
    assert.ok(resumeAt - ctx.now >= 6 * 3600000);
    assert.ok(resumeAt - ctx.now < 6 * 3600000 + 60000);
    const delays = [...ctx.scheduled.values()].map(item => item.trigger.seconds);
    assert.ok(delays[0] >= 21600 && delays[0] < 21660);
    assert.equal(delays[1] - delays[0], 3600);
  });
}

test('stop cancels pending alerts and prevents rescheduling from stale server data', async () => {
  const ctx = setup();
  ctx.scheduled.set('old', { identifier: 'old', content: { data: { reminderId: '42' } } });
  assert.equal(await ctx.notificationService.handleReminderNotificationResponse(response('reminder-stop')), 'stopped');
  await ctx.notificationService.syncAssignedReminderNotifications([{ id: '42', status: 'Pending', reminder_date: '2026-09-19T10:00:00' }]);
  assert.equal(ctx.scheduled.size, 0);
  assert.equal(ctx.updates[0].status, 'Dismissed');
});

test('default tap does not change reminder and category offers six-hour snooze', async () => {
  const ctx = setup();
  assert.equal(await ctx.notificationService.handleReminderNotificationResponse(response('default')), 'opened');
  assert.equal(ctx.updates.length, 0);
  await ctx.notificationService.configureReminderActions();
  assert.equal(ctx.getCategory()[0].buttonTitle, 'Snooze 6 Hours');
});
