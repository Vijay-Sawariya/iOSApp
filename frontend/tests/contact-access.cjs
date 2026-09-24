const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../utils/contactAccess.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: api });
const lead = { current_assignee_id: 7, can_view_sensitive: true, phone: '9876543210' };
test('assigned contact actions require explicit grant, server access, and unmasked phone', () => {
  for (const flag of [undefined, null, false, 0, '0']) {
    assert.equal(api.canContactAssignedLead({ ...lead, assignment_can_view_private: flag }), false);
  }
  assert.equal(api.canContactAssignedLead({ ...lead, assignment_can_view_private: true }), true);
  assert.equal(api.canContactAssignedLead({ ...lead, assignment_can_view_private: true, can_view_sensitive: false }), false);
  assert.equal(api.canContactAssignedLead({ ...lead, assignment_can_view_private: true, phone: '98******10' }), false);
});
test('list and detail contacts fail closed for unchecked assignments even with older access flag', () => {
  assert.equal(api.canViewLeadContacts(lead, '7'), false);
  assert.equal(api.canViewLeadContacts({ ...lead, assignment_can_view_private: false }, 7), false);
  assert.equal(api.canViewLeadContacts({ ...lead, assignment_can_view_private: true }, 7), true);
  assert.equal(api.canViewLeadContacts({ ...lead, assignment_can_view_private: true, can_view_sensitive: false }, 7), false);
  assert.equal(api.canViewLeadContacts(lead, 8), true);
});
