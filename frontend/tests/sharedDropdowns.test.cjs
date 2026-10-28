const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const groups = ['locations', 'floors', 'bhk', 'facings', 'lead_sources', 'amenities'];
const catalogue = (suffix = '') => ({ schema_version: 1, options: Object.fromEntries(groups.map(group =>
  [group, [{ value: group + suffix, label: group + ' label' + suffix }]])) });
function setup(initialCache = null) {
  let cache = initialCache;
  let fail = false;
  let payload = catalogue();
  let requests = 0;
  const arrays = Object.fromEntries(['LOCATIONS', 'FLOORS', 'BHK_OPTIONS', 'FACINGS', 'LEAD_SOURCES', 'AMENITIES', 'FILTER_FACINGS'].map(key => [key, []]));
  arrays.updateLocationCount = () => {};
  const exports = {};
  const storage = { getItem: async () => cache, setItem: async (_, value) => { cache = value; } };
  const source = fs.readFileSync(path.join(__dirname, '../services/sharedDropdowns.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = { exports, AbortController, setTimeout, clearTimeout, console,
    fetch: async () => { requests++; if (fail) throw new Error('offline'); return { ok: true, json: async () => payload }; },
    require: name => {
      if (name === 'react') return { useSyncExternalStore: (_, get) => get() };
      if (name.includes('async-storage')) return { default: storage };
      if (name.includes('leadOptions')) return arrays;
      if (name.includes('config')) return { API_URL: 'https://example.test' };
      throw new Error(name);
    }
  };
  vm.runInNewContext(compiled, context);
  return { service: exports, arrays, offline: () => { fail = true; }, set: value => { payload = value; }, cache: () => cache, requests: () => requests };
}

test('loads all groups, refreshes stable references, and persists authoritative data', async () => {
  const fixture = setup();
  const reference = fixture.arrays.LOCATIONS;
  await fixture.service.refreshSharedDropdowns();
  assert.equal(fixture.service.useSharedDropdowns().ready, true);
  assert.equal(reference[0], 'locations');
  assert.equal(fixture.arrays.AMENITIES[0].key, 'amenities');
  fixture.set(catalogue('_new'));
  await fixture.service.refreshSharedDropdowns();
  assert.equal(fixture.arrays.LOCATIONS, reference);
  assert.equal(reference[0], 'locations_new');
  assert.equal(JSON.parse(fixture.cache()).options.locations[0].value, 'locations_new');
});

test('uses last downloaded catalogue offline without app-specific defaults', async () => {
  const fixture = setup(JSON.stringify(catalogue('_cached')));
  fixture.offline();
  await fixture.service.refreshSharedDropdowns();
  assert.equal(fixture.arrays.BHK_OPTIONS[0], 'bhk_cached');
  assert.equal(fixture.service.useSharedDropdowns().ready, true);
  assert.match(fixture.service.useSharedDropdowns().error, /last downloaded/);
});

test('first offline launch and invalid responses remain explicit failures', async () => {
  const fixture = setup();
  fixture.offline();
  await fixture.service.refreshSharedDropdowns();
  assert.equal(fixture.service.useSharedDropdowns().ready, false);
  assert.equal(fixture.arrays.LOCATIONS.length, 0);
  const invalid = setup();
  invalid.set({ schema_version: 1, options: {} });
  await invalid.service.refreshSharedDropdowns();
  assert.equal(invalid.service.useSharedDropdowns().ready, false);
  assert.equal(invalid.cache(), null);
});

test('concurrent refresh requests share one fetch', async () => {
  const fixture = setup();
  await Promise.all([fixture.service.refreshSharedDropdowns(), fixture.service.refreshSharedDropdowns()]);
  assert.equal(fixture.requests(), 1);
});
