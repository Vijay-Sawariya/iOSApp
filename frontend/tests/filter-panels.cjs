const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function host() {
  const slots = []; let index = 0; let effects = []; let dismissals = 0;
  const react = {
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useLayoutEffect(effect) { effects.push(effect); },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../hooks/useFilterPanel.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === 'react' ? react : { Keyboard: { dismiss: () => dismissals++ } } });
  return {
    render() { index = 0; effects = []; const result = exports.useFilterPanel(); effects.forEach(effect => effect()); return result; },
    dismissals: () => dismissals,
  };
}

test('opening and closing reset a scrolled list and dismiss the keyboard; ordinary renders preserve scroll', () => {
  const h = host(); let panel = h.render(); let offset = 750;
  panel.listRef.current = { scrollToOffset: options => { offset = options.offset; assert.equal(options.animated, false); } };
  assert.equal(panel.expanded, false);
  panel.toggle(); panel = h.render();
  assert.equal(panel.expanded, true); assert.equal(offset, 0);
  offset = 900; panel = h.render(); assert.equal(offset, 900);
  panel.toggle(); panel = h.render();
  assert.equal(panel.expanded, false); assert.equal(offset, 0);
  assert.equal(h.dismissals(), 2);
});

test('programmatic Apply collapse and legacy ScrollView use the same behavior', () => {
  const h = host(); let panel = h.render(); let y = 500;
  panel.scrollRef.current = { scrollTo: options => { y = options.y; } };
  panel.setExpanded(true); panel = h.render(); assert.equal(y, 0);
  y = 800; panel.setExpanded(false); panel = h.render();
  assert.equal(y, 0); assert.equal(panel.expanded, false);
  panel.setExpanded(false); h.render(); assert.equal(h.dismissals(), 2);
});

for (const file of ['app/(tabs)/clients.tsx', 'app/(tabs)/builders.tsx', 'app/(tabs)/inventory.tsx', 'app/map.tsx', 'components/MatchingLeadsModal.tsx']) {
  test(`${file}: criteria share the results list header, including empty states`, () => {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const lists = [];
    function walk(node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'FlatList') lists.push(node);
      ts.forEachChild(node, walk);
    }
    walk(source);
    const list = lists.find(node => node.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(source) === 'ref' && p.initializer?.getText(source) === '{listRef}'));
    assert.ok(list, 'results list must use the shared scroll ref');
    const props = list.attributes.properties;
    const header = props.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === 'ListHeaderComponent');
    assert.ok(header?.getText(source).includes('showFilters &&'), 'expanded fields must scroll with results');
    assert.ok(props.some(p => ts.isJsxAttribute(p) && p.name.getText(source) === 'ListEmptyComponent'));
    assert.ok(!props.some(p => ts.isJsxAttribute(p) && p.name.getText(source) === 'maintainVisibleContentPosition'));
    assert.ok(props.some(p => ts.isJsxSpreadAttribute(p) && p.expression.getText(source) === 'filterScrollProps'));
  });
}
