const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

// Render the real component with a small hook host; network and native widgets
// are boundaries, so tests can exercise submissions without an iOS simulator.
function host({ width = 390, fail = false, floors = ['Ground', 'First'] } = {}) {
  const state = []; let index = 0; let effectStarted = false; let tree;
  const calls = []; let closed = 0; let refreshed = 0;
  const snapshot = { floors, prices: floors.map((floor_label, i) => ({ floor_label, floor_amount: i + 1 })), property_price: 4, unit: 'Cr', inventory_version: 'v1', entire_sold: false, can_edit_prices: true };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState: initial => { const slot = index++; if (!(slot in state)) state[slot] = initial; return [state[slot], value => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }]; },
    useRef: initial => { const slot = index++; if (!(slot in state)) state[slot] = { current: initial }; return state[slot]; },
    useEffect: effect => { if (!effectStarted) { effectStarted = true; effect(); } },
  };
  const api = {
    getInventoryUpdate: async () => snapshot,
    saveInventoryUpdate: async (id, body) => { calls.push({ id, body }); if (fail) throw new Error('Inventory changed. Reopen the popup.'); },
  };
  const native = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Modal', 'ScrollView', 'Text', 'TextInput', 'TouchableOpacity', 'View'].map(name => [name, name]));
  Object.assign(native, { StyleSheet: { create: x => x }, Platform: { OS: 'ios' }, useWindowDimensions: () => ({ width }) });
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/InventoryUpdateModal.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    if (name === 'react') return react;
    if (name === 'react-native') return native;
    if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (name === '../services/api') return { api };
    throw new Error(name);
  } });
  function render() { index = 0; tree = exports.default({ leadId: 42, onClose: () => closed++, onSaved: () => refreshed++ }); }
  function all(node = tree) { return !node || typeof node !== 'object' ? [] : [node, ...node.props.children.flatMap(child => all(child))]; }
  function byLabel(label) { return all().find(n => n.props.accessibilityLabel === label); }
  function save() { return all().find(n => n.type === 'TouchableOpacity' && n.props.accessibilityRole === 'button').props.onPress(); }
  render();
  return { render, all, byLabel, save, calls, ready: async () => { await Promise.resolve(); render(); }, closed: () => closed, refreshed: () => refreshed };
}

test('all floors are prefilled, and entire sold disables individual controls', async () => {
  const h = host(); await h.ready();
  assert.equal(h.byLabel('Ground price in Cr').props.value, '1');
  assert.equal(h.byLabel('First price in Cr').props.value, '2');
  h.byLabel('Entire property sold').props.onPress(); h.render();
  assert.equal(h.byLabel('Ground price in Cr').props.editable, false);
  assert.ok(h.all().filter(n => n.props.accessibilityLabel === 'Sold').every(n => n.props.disabled));
});

test('verification notes required, failures retain modal and user edits', async () => {
  const h = host({ fail: true }); await h.ready();
  await h.save(); h.render();
  assert.equal(h.calls.length, 0);
  h.byLabel('Call verification notes').props.onChangeText('Confirmed on call');
  h.byLabel('First price in Cr').props.onChangeText('3.25'); h.render();
  await h.save(); h.render();
  assert.equal(h.closed(), 0); assert.equal(h.refreshed(), 0);
  assert.equal(h.byLabel('First price in Cr').props.value, '3.25');
  assert.ok(h.all().some(n => n.props.accessibilityRole === 'alert' && n.props.children.includes('Inventory changed. Reopen the popup.')));
});

test('one submission includes all floors, notes and version; success refreshes and closes', async () => {
  const h = host(); await h.ready();
  h.byLabel('Call verification notes').props.onChangeText('Confirmed on call'); h.render();
  await Promise.all([h.save(), h.save()]);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].id, 42);
  assert.equal(h.calls[0].body.floors.length, 2); assert.equal(h.calls[0].body.inventory_version, 'v1');
  assert.equal(h.closed(), 1); assert.equal(h.refreshed(), 1);
});

test('property price fallback and responsive column widths', async () => {
  const empty = host({ floors: [] }); await empty.ready();
  assert.equal(empty.byLabel('Property price in Cr').props.value, '4');
  for (const [width, expected] of [[320, '100%'], [390, '50%'], [820, `${100 / 3}%`]]) {
    const h = host({ width }); await h.ready();
    const cells = h.all().filter(n => n.type === 'View' && Array.isArray(n.props.style) && n.props.style[1]?.width);
    assert.equal(cells.length, 2); assert.equal(cells[0].props.style[1].width, expected);
  }
});
