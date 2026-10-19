const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const exportsObject = {};
const source = fs.readFileSync(path.join(__dirname, '../services/enquiryPresentation.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const { formatEnquiryDate, enquiryStatusLabel } = exportsObject;

test('LMS wall-clock timestamps keep IST date and time with exact requested display', () => {
  assert.equal(formatEnquiryDate('2026-10-18 21:51:50'), '18 Oct 2026, 09:51 PM');
  assert.equal(formatEnquiryDate('2026-10-20T13:35:00'), '20 Oct 2026, 01:35 PM');
  assert.equal(formatEnquiryDate('2026-10-20T00:05:00'), '20 Oct 2026, 12:05 AM');
});
test('timestamps with offsets convert to IST, including date rollover', () => {
  assert.equal(formatEnquiryDate('2026-10-18T16:21:50Z'), '18 Oct 2026, 09:51 PM');
  assert.equal(formatEnquiryDate('2026-10-19T20:00:00Z'), '20 Oct 2026, 01:30 AM');
});
test('missing timestamps have a readable fallback', () => {
  assert.equal(formatEnquiryDate(null), 'Not provided');
  assert.equal(formatEnquiryDate('invalid'), 'Not provided');
});
test('invalid status display does not change stored workflow values', () => {
  assert.equal(enquiryStatusLabel('Invalid'), 'Junk/Invalid');
  assert.equal(enquiryStatusLabel('Qualified'), 'Qualified');
});
