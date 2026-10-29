const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../services/inventoryRecipientMatching.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(code, context);
const defaults = lead => JSON.parse(JSON.stringify(context.exports.recipientFiltersFromLead(lead)));
test('client defaults match the web area and unexpanded budget', () => {
  const result = defaults({ location: 'GK 1', area_size: 208, floor: 'GF', budget_min: 6.5, budget_max: 6.5 });
  assert.deepEqual(result, { locations:['GK 1'], floors:['GF'], area_min:'158', area_max:'258', budget_min:'6.5', budget_max:'6.5' });
});
test('floor-wise prices, labels and area conversions seed the filters', () => {
  const result = defaults({ area_size:1872, area_unit:'SQFT', floor:'GF', floor_pricing:[{floor_label:'FF',floor_amount:7},{floor_label:'SF',floor_amount:8}] });
  assert.equal(result.area_min, '158');
  assert.equal(result.area_max, '258');
  assert.equal(result.budget_min, '7');
  assert.equal(result.budget_max, '8');
  assert.deepEqual(result.floors, ['GF','FF','SF']);
});
test('missing inventory specifications leave filters blank', () => {
  assert.deepEqual(defaults(null), { locations:[], floors:[], area_min:'', area_max:'', budget_min:'', budget_max:'' });
});
