const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function host(overrides = {}, canAssign = true) {
  const slots = []; let index = 0;
  const changes = [], routes = [], calls = [], alerts = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState: initial => {
      const slot = index++; if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useRef: initial => { const slot = index++; if (!(slot in slots)) slots[slot] = { current: initial }; return slots[slot]; },
  };
  const exports = {};
  const item = { id: 1, status: 'New', assigned_to: 8, full_name: 'Client', ...overrides };
  const controls = { EnquiryButton: 'Button', EnquiryField: 'Field', EnquirySelect: 'Select', EnquiryDateTime: 'DateTime', enquiryStyles: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/EnquiryCardActions.tsx'), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    if (name === 'react') return { ...react, default: react };
    if (name === 'react-native') return { ...Object.fromEntries(['ActivityIndicator', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TouchableOpacity', 'View'].map(x => [x, x])), Alert: { alert: (...args) => alerts.push(args) } };
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name === 'expo-router') return { router: { push: route => routes.push(route) } };
    if (name === '../services/api') return { api: {
      updateEnquiry: async (...args) => { calls.push(args); return { lead_id: 21 }; },
      getReminders: async () => [],
      getEnquiryDetail: async () => ({ history: [], followups: [] }),
      searchEnquiryLeads: async (...args) => { calls.push(['search', ...args]); return [{ id: 21, name: 'Existing', phone: '9811111111', assigned_to: 8 }]; },
    } };
    if (name === '../services/notificationService') return { notificationService: { requestPermissions: async () => true, syncAssignedReminderNotifications: async () => {} } };
    if (name === '../constants/theme') return { colors: {} };
    if (name === './EnquiryControls') return controls;
    throw Error(name);
  } });
  let tree;
  function nodes() {
    const all = []; const walk = n => { if (!n || typeof n !== 'object') return; all.push(n); (n.children || []).forEach(walk); }; walk(tree); return all;
  }
  const h = {
    render: () => { index = 0; tree = exports.default({ item, canAssign, users: [{ id: 8, username: 'agent', full_name: 'Agent' }], onChanged: v => changes.push(v) }); return h; },
    find: predicate => { const n = nodes().find(predicate); assert.ok(n, 'Expected element'); return n; },
    icon: label => nodes().find(n => n.props?.accessibilityLabel === label),
    changes, routes, calls, alerts,
  };
  return h.render();
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('new card has four matching actions and opens the enquiry', () => {
  const h = host();
  for (const label of ['Junk / Invalid', 'Assignment', 'Open enquiry', 'Link existing lead']) assert.ok(h.icon(label));
  h.icon('Open enquiry').props.onPress(); assert.equal(h.routes[0], '/enquiries/1');
});

test('invalid card disables opening/linking, allows assignment and restores directly', async () => {
  const h = host({ status: 'Invalid' });
  assert.equal(h.icon('Open (restore to New first)').props.disabled, true);
  assert.equal(h.icon('Link existing lead').props.disabled, true);
  assert.ok(h.icon('Assignment'));
  h.icon('Restore to New').props.onPress(); await settle();
  assert.equal(h.calls[0][1], 'restore_invalid'); assert.equal(h.changes[0].status, 'New');
});

test('converted card only opens enquiry or linked lead, staff cannot assign', () => {
  const h = host({ main_lead_id: 21 });
  assert.equal(h.icon('Junk / Invalid'), undefined); assert.equal(h.icon('Assignment'), undefined);
  assert.equal(h.icon('Link existing lead'), undefined);
  h.icon('View lead').props.onPress(); assert.equal(h.routes[0], '/leads/21');
  assert.equal(host({}, false).icon('Assignment'), undefined);
});

test('invalid marking requires confirmation and updates the card', async () => {
  const h = host(); h.icon('Junk / Invalid').props.onPress();
  assert.equal(h.calls.length, 0);
  h.alerts[0][2].find(a => a.text === 'Mark Invalid').onPress(); await settle();
  assert.equal(h.calls[0][1], 'mark_invalid'); assert.equal(h.changes[0].status, 'Invalid');
});

test('assignment opens a dialog with current employee and saves directly', async () => {
  const h = host(); h.icon('Assignment').props.onPress(); h.render();
  assert.equal(h.find(n => n.type === 'Select').props.value, '8');
  h.find(n => n.type === 'Button' && n.props.title === 'Assign').props.onPress(); await settle();
  assert.equal(h.calls[0][1], 'assign'); assert.equal(h.calls[0][2].assigned_to, 8);
  assert.equal(h.changes[0].employee, 'Agent');
});

test('link dialog searches, selects and links without visiting detail', async () => {
  const h = host(); h.icon('Link existing lead').props.onPress(); h.render();
  h.find(n => n.type === 'Field').props.onChange('Existing'); h.render();
  await h.find(n => n.type === 'Button' && n.props.title === 'Search leads').props.onPress(); h.render();
  h.find(n => n.props.accessibilityRole === 'radio').props.onPress(); h.render();
  const confirm = h.find(n => n.type === 'Button' && n.props.title === 'Confirm existing lead');
  assert.equal(!!confirm.props.disabled, false); confirm.props.onPress(); await settle();
  const call = h.calls.find(c => c[1] === 'link_existing');
  assert.equal(call[2].lead_id, 21); assert.equal(call[2].assigned_to, 8);
  assert.equal(h.changes[0].main_lead_id, 21); assert.equal(h.routes.length, 0);
});


test('follow-up modal saves conversation without scheduling and requires owner for unassigned enquiry', async () => {
  const h = host({ assigned_to: null });
  h.icon('Follow-up details').props.onPress(); await settle(); h.render();
  let button = h.find(n => n.type === 'Button' && n.props.title === 'Save outcome');
  assert.equal(!!button.props.disabled, true);
  h.find(n => n.type === 'Select' && n.props.label === 'Outcome *').props.onChange('Connected');
  h.find(n => n.type === 'Select' && n.props.label === 'Assignment').props.onChange('8');
  h.find(n => n.type === 'Field' && n.props.label === 'Remarks').props.onChange('Discussed requirements'); h.render();
  button = h.find(n => n.type === 'Button' && n.props.title === 'Save outcome');
  assert.equal(!!button.props.disabled, false); button.props.onPress(); await settle();
  const saved = h.calls.find(c => c[1] === 'followup');
  assert.equal(saved[2].due_at, ''); assert.equal(saved[2].assigned_to, 8); assert.equal(saved[2].outcome, 'Connected');
});
