const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: name => load(path.resolve(path.dirname(file), `${name}.ts`)) });
  return exports;
}
const { canShowInventory, formatInventoryCopy } = load(path.join(__dirname, '../utils/inventory.ts'));
const lead = { id: 1587, location: 'Defence Colony', address: 'D-201', area_size: '325', floor: 'Kothi', bhk: '5+ BHK', car_parking_number: 4, unit: 'Lac', floor_pricing: [{ floor_label: 'Kothi', floor_amount: 10 }] };
test('copy matches the requested format exactly', () => {
  assert.equal(formatInventoryCopy(lead), '01-1587) 325 Sq. Yds. At Defence Colony\nLocation: Defence Colony\nSize: 325 Sq. Yds.\nConfiguration: Kothi | — 5+ Bedrooms\nParking: 4 Cars\nKothi: ₹10 Lac Negotiable');
  assert.ok(formatInventoryCopy(lead, 2).startsWith('02-1587)'));
  assert.ok(!formatInventoryCopy(lead).includes('D-201'));
});
test('closed inventory is shown only for an explicit status or matching address', () => {
  for (const status of ['Sold', 'Not available', 'Not-Available', 'Ready, Sold']) {
    const closed = { ...lead, lead_status: status };
    for (const search of ['', 'Defence Colony', 'Ram', '9717113347', 'Available']) assert.equal(canShowInventory(closed, search), false);
    assert.equal(canShowInventory(closed, 'D-201'), true);
    assert.equal(canShowInventory(closed, '', [], 'D-201'), true);
    assert.equal(canShowInventory(closed, 'D-202'), false);
  }
  assert.equal(canShowInventory({ ...lead, lead_status: 'Sold' }, 'sold'), true);
  assert.equal(canShowInventory({ ...lead, lead_status: 'Not Available' }, 'not available'), true);
  assert.equal(canShowInventory({ ...lead, lead_status: 'Sold' }, '', ['Sold']), true);
  assert.equal(canShowInventory({ ...lead, lead_status: 'Available' }, ''), true);
});
test('copy handles multiple prices and missing optional fields', () => {
  const text = formatInventoryCopy({ ...lead, floor: 'GF,FF', bhk: '1 BHK', car_parking_number: 1, floor_pricing: [{ floor_label: 'GF', floor_amount: 2.50 }, { floor_label: 'FF', floor_amount: 3 }], unit: 'CR' });
  assert.ok(text.includes('Ground Floor | First Floor | — 1 Bedroom'));
  assert.ok(text.includes('Parking: 1 Car\nGround Floor: ₹2.5 Cr Negotiable\nFirst Floor: ₹3 Cr Negotiable'));
  assert.ok(formatInventoryCopy({ id: 2 }).includes('Ask: On Request Negotiable'));
});
