const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup() {
  const requests = [], removed = [];
  let response = { ok: true, status: 200, json: async () => ({ lead_id: 42 }) };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../services/api.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, {
    exports, AbortController, setTimeout, clearTimeout, console: { log() {} },
    fetch: async (url, options) => { requests.push({ url, options }); return response; },
    require: name => {
      if (name === '../constants/config') return { API_URL: 'https://api.example.test' };
      if (name === './cacheService') return { CACHE_KEYS: { REMINDERS: 'reminders', URGENT_FOLLOWUPS: 'urgent', LEADS_CLIENTS: 'clients', LEADS_INVENTORY: 'inventory', LEAD_DETAIL_PREFIX: 'lead_' }, cacheService: { remove: async key => removed.push(key) } };
      return {};
    },
  });
  exports.setAuthToken('test-token');
  return { ...exports, requests, removed, response: next => { response = next; } };
}

test('enquiry listing sends encoded filters and authenticated network requests', async () => {
  const h = setup();
  await h.api.getEnquiryManagement({ q: 'A&B +91', due: true, duplicates: false, page: 2, status: '' });
  const { url, options } = h.requests[0];
  assert.match(url, /q=A%26B%20%2B91/);
  assert.match(url, /due=true/); assert.match(url, /page=2/);
  assert.doesNotMatch(url, /duplicates|status=/);
  assert.equal(options.headers.Authorization, 'Bearer test-token');
  assert.ok(options.signal);
});

test('conversion uses the new workflow and invalidates client and detail caches', async () => {
  const h = setup();
  const body = { assigned_to: 8, name: 'Client', lead_type: 'buyer' };
  const result = await h.api.updateEnquiry(1, 'qualify', body);
  assert.equal(result.lead_id, 42);
  assert.match(h.requests[0].url, /enquiry-management\/1\/qualify$/);
  assert.equal(h.requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(h.requests[0].options.body), body);
  assert.ok(h.removed.includes('clients')); assert.ok(h.removed.includes('lead_42'));
});

test('assignment and follow-ups invalidate reminders', async () => {
  for (const action of ['assign', 'followup']) {
    const h = setup(); await h.api.updateEnquiry(1, action, {});
    assert.ok(h.removed.includes('reminders'));
    assert.ok(h.removed.includes('urgent_5'));
  }
});

test('validation errors keep the server message and do not clear caches', async () => {
  const h = setup();
  h.response({ ok: false, status: 409, json: async () => ({ detail: 'A matching Main Lead exists.' }) });
  await assert.rejects(h.api.updateEnquiry(1, 'qualify', {}), /A matching Main Lead exists/);
  assert.equal(h.removed.length, 0);
});

test('existing-lead search escapes phone query text', async () => {
  const h = setup(); await h.api.searchEnquiryLeads(12, '+91 98111');
  assert.match(h.requests[0].url, /enquiry-management\/12\/leads\?q=%2B91%2098111$/);
});
