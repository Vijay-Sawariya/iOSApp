const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

test('reminder becomes usable while optional assignee request is unresolved', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/reminders/edit/[id].tsx'), 'utf8');
  const start = source.indexOf('  const loadData = async');
  const end = source.indexOf('  // Debounced search', start);
  const state = {};
  const setters = Object.fromEntries([...source.slice(start, end).matchAll(/\b(set\w+)\(/g)].map(([_, name]) => [name, value => {
    state[name] = typeof value === 'function' ? value(state[name]) : value;
  }]));
  let resolveUsers;
  const context = {
    ...setters, reminderId: '42', console,
    Alert: { alert() { throw new Error('Unexpected loading error'); } },
    api: {
      getReminders: async () => [{ id: 42, title: 'Call buyer', reminder_type: 'Call', status: 'pending', assigned_to: 7, reminder_date: '2026-10-08T10:00:00' }],
      getAssignableUsers: () => new Promise(resolve => { resolveUsers = resolve; }),
    },
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(source.slice(start, end) + '\nglobalThis.load = loadData;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  await context.load();
  assert.equal(state.setInitialLoading, false);
  assert.equal(state.setTitle, 'Call buyer');
  assert.equal(state.setSelectedAssignedUser.id, 7);
  resolveUsers([{ id: 7, username: 'agent' }]);
  await Promise.resolve();
  assert.equal(state.setSelectedAssignedUser.username, 'agent');
});
