const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/monthlyInventory.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(code, { exports: exportsObject });
const { bookFloors, conversionParams } = exportsObject;

test('book floors preserve basement/ground and terrace combinations', () => {
  assert.equal(bookFloors('BMT+GF+FF+SF+TF+TERR'), 'BMT+GF,FF,SF,TF+Terr');
  assert.equal(bookFloors('TF + TERRACE, FF, FF'), 'TF+Terr,FF');
  assert.equal(bookFloors('GF+STILT'), 'GF,STILT');
  assert.equal(bookFloors(''), '');
});

test('sale conversion keeps original note out of Lead Notes and one primary phone', () => {
  const params = conversionParams({ id: 10, category: 'residential_sale', owner_name: 'ANKUR ARORA', phone: '9811111111, 9822222222',
    location: 'Anand Niketan', address: 'C-5', area_size: '400.00', area_unit: 'YD', floor: 'BMT+GF+FF', configuration: '4BR+2BR', note: 'Original 9822222222' });
  assert.equal(params.monthlyEntryId, '10');
  assert.equal(params.name, 'Ankur Arora');
  assert.equal(params.phone, '9811111111');
  assert.equal(params.initialLeadType, 'builder');
  assert.equal(params.unit, 'CR');
  assert.equal(params.propertyType, 'Builder Floor');
  assert.equal(params.floor, 'BMT+GF,FF');
  assert.equal(params.bhk, '4 BHK,2 BHK');
  assert.equal(params.notes, '');
});

test('commercial rent conversion uses Builder and thousands and retains area unit', () => {
  const params = conversionParams({ id: 12, category: 'commercial_rent', area_size: 1200, area_unit: 'SQFT' });
  assert.equal(params.initialLeadType, 'builder');
  assert.equal(params.unit, 'K');
  assert.equal(params.propertyType, 'Commercial');
  assert.equal(params.areaUnit, 'SQFT');
  assert.equal(params.areaSize, '1200');
});
