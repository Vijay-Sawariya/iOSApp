const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../utils/deferredListUpdates.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exported });
const { createDeferredListUpdates } = exported;

test('background refreshes cannot replace cards while reading or scrolling down', () => {
  const displayed = [];
  const updates = createDeferredListUpdates(data => displayed.push(data));
  updates.receive('cached');
  updates.beginInteraction();
  updates.onScroll(700);
  updates.receive('live');
  updates.endInteraction(700);
  updates.receive('sync');
  assert.deepEqual(displayed, ['cached']);
  updates.beginInteraction();
  updates.onScroll(0);
  assert.deepEqual(displayed, ['cached']);
  updates.endInteraction(0);
  assert.deepEqual(displayed, ['cached', 'sync']);
});

test('manual refresh or saved edit applies immediately and discards older pending data', () => {
  const displayed = [];
  const updates = createDeferredListUpdates(data => displayed.push(data));
  updates.receive('initial');
  updates.onScroll(500);
  updates.receive('older background result');
  updates.receive('saved edit', true);
  updates.onScroll(0);
  assert.deepEqual(displayed, ['initial', 'saved edit']);
});

test('initial load and updates at rest at the top remain immediate', () => {
  const displayed = [];
  const updates = createDeferredListUpdates(data => displayed.push(data));
  updates.receive('initial');
  updates.receive('live');
  assert.deepEqual(displayed, ['initial', 'live']);
});
