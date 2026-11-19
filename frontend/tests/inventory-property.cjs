const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const vm = require('node:vm'); const ts = require('typescript');
const output = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../utils/inventoryProperty.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:output});
test('all four property/transaction combinations and unknown types', () => {
 for (const category of ['commercial','residential']) for (const transaction of ['sale','rent']) {
  const lead = { property_type: category === 'commercial' ? 'Commercial' : 'Builder Floor', lead_type: transaction === 'rent' ? 'landlord' : 'builder' };
  assert.equal(output.matchesInventoryPropertyFilter(lead, category+'_'+transaction), true);
  assert.equal(output.matchesInventoryPropertyFilter(lead, (category === 'commercial' ? 'residential' : 'commercial')+'_'+transaction), false);
 }
 assert.equal(output.inventoryPropertyCategory(''), null);
});
test('zero range includes blank and null prices but excludes priced floors', () => {
 for (const value of [null, '', '0', 0]) assert.equal(output.hasUnpricedInventory({budget_min:value,budget_max:value}), true);
 assert.equal(output.hasUnpricedInventory({budget_min:0,budget_max:0,floor_pricing:[{floor_amount:5}]}),false);
 assert.equal(output.hasUnpricedInventory({budget_min:2,budget_max:0}),false);
});

test('price date matches web LMS floor priority and creation fallback', () => {
 const lead = { created_at: '2020-01-01', updated_on: '2026-11-18', budget_max: 5 };
 assert.equal(output.inventoryPriceUpdatedOn(lead), '2020-01-01');
 assert.equal(output.inventoryPriceUpdatedOn({...lead, price_updated_on:'2026-10-01'}), '2026-10-01');
 assert.equal(output.inventoryPriceUpdatedOn({...lead, floor_pricing:[{floor_amount:0}]}), null);
 assert.equal(output.inventoryPriceUpdatedOn({...lead, budget_max:0}), null);
 assert.equal(output.inventoryPriceUpdatedOn({...lead, budget_max:0, floor_pricing:[{floor_amount:2}]}), '2020-01-01');
});
