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
  assert.equal(formatInventoryCopy(lead), 'Property Ref Id: 01-1587 - 325 Sq. Yds. At Defence Colony\n\nLocation: Defence Colony\n\nSize: 325 Sq. Yds.\n\nConfiguration: Kothi | — 5+ Bedrooms\n\nParking: 4 Cars\n\nKothi: ₹10 Lac Negotiable');
  assert.ok(formatInventoryCopy(lead, 2).startsWith('Property Ref Id: 02-1587 -'));
  assert.ok(!formatInventoryCopy(lead).includes('D-201'));
});
test('closed inventory is shown only for an explicit status', () => {
  for (const status of ['Sold', 'Not available', 'Not-Available', 'Unavailable', 'Un-available', 'Ready, Sold']) {
    const closed = { ...lead, lead_status: status };
    for (const search of ['', 'Defence Colony', 'Ram', '9717113347', 'Available']) assert.equal(canShowInventory(closed, search), false);
    assert.equal(canShowInventory(closed, 'D-201'), false);
    assert.equal(canShowInventory(closed, '', [], 'D-201'), false);
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
  assert.ok(text.includes('Parking: 1 Car\n\nGround Floor: ₹2.5 Cr Negotiable\n\nFirst Floor: ₹3 Cr Negotiable'));
  assert.ok(formatInventoryCopy({ id: 2 }).includes('Ask: On Request Negotiable'));
});

test('internal copy includes address and locality only in its reference line', () => {
  const shared = formatInventoryCopy(lead);
  const internal = formatInventoryCopy(lead, 1, true);
  assert.equal(internal.split('\n\n')[0], 'Property Ref Id: 01-1587 - D-201, Defence Colony | 325 Sq. Yds. At Defence Colony');
  assert.equal(internal.slice(internal.indexOf('\n\n')), shared.slice(shared.indexOf('\n\n')));
  assert.ok(!formatInventoryCopy({ ...lead, address: null }, 1, true).includes('null'));
});

const { formatInventoryPricing, getInventoryPrices } = load(path.join(__dirname, '../constants/leadOptions.ts'));
const { sortInventory } = load(path.join(__dirname, '../utils/inventory.ts'));

test('inventory shows its overall asking price when no floor prices exist', () => {
  const property = { id: 42, floor: 'TF+Terr', unit: 'CR', budget_max: '16.50', floor_pricing: [] };
  assert.equal(formatInventoryPricing(property), '₹16.50 Cr');
  assert.deepEqual(Array.from(getInventoryPrices(property)), [16.5]);
  assert.deepEqual(Array.from(getInventoryPrices(property, ['TF+Terr'])), [16.5]);
  assert.ok(formatInventoryCopy(property).includes('Ask: ₹16.5 Cr Negotiable'));
});

test('valid floor prices take precedence; missing or invalid prices do not become zero asks', () => {
  const property = { ...lead, budget_max: 16.5 };
  assert.equal(formatInventoryPricing(property), 'Kothi: ₹10 Lac');
  assert.deepEqual(Array.from(getInventoryPrices(property, ['GF'])), []);
  for (const value of [null, undefined, '', 'invalid', 0, -1]) {
    const missing = { unit: 'CR', budget_max: value, floor_pricing: [{ floor_label: 'GF', floor_amount: value }] };
    assert.equal(formatInventoryPricing(missing), null);
    assert.deepEqual(Array.from(getInventoryPrices(missing)), []);
    assert.equal(formatInventoryPricing({ ...missing, budget_min: 2 }), '₹2.00 Cr');
  }
});

test('cached and live inventories use identical ordering, with deterministic ties', () => {
  const a = { id: 1, created_at: '2026-06-01 12:00:00', updated_on: '2026-10-05 12:00:00' };
  const b = { id: 2, created_at: '2026-08-01 12:00:00', updated_on: '2026-10-04 12:00:00' };
  const c = { ...b, id: 3 };
  const cached = [b, c, a];
  assert.deepEqual(Array.from(sortInventory(cached), item => item.id), [1, 3, 2]);
  assert.deepEqual(Array.from(sortInventory([a, c, b]), item => item.id), [1, 3, 2]);
  assert.deepEqual(cached, [b, c, a]);
});
