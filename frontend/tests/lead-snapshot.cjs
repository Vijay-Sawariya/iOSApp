const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');

test('SQLite snapshot reconciliation removes omitted records in its category and preserves pending changes', async () => {
  let query, parameters;
  const database = {
    execAsync: async () => {}, getAllAsync: async (sql, args) => { query = sql; parameters = args; return []; },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../services/database.native.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: () => ({ openDatabaseAsync: async () => database }), console });
  await exports.initDatabase();
  for (const category of ['clients', 'inventory']) {
    for (const ids of [[1, 5], []]) {
      await exports.pruneLeadSnapshot(category, ids);
      const result = spawnSync('python3', ['-c', `
import sqlite3,json,sys
query,args,category,ids=json.loads(sys.stdin.read())
c=sqlite3.connect(':memory:')
c.executescript("CREATE TABLE leads(id INTEGER,lead_type TEXT); CREATE TABLE pending_operations(entity_type TEXT,local_entity_id INTEGER);")
c.executemany('INSERT INTO leads VALUES (?,?)',[(1,'buyer'),(2,'tenant'),(3,'buyer'),(-4,'buyer'),(5,'seller'),(6,'owner'),(7,'landlord')])
c.executemany('INSERT INTO pending_operations VALUES (?,?)',[('lead',3),('lead',7)])
print(json.dumps([r[0] for r in c.execute(query,args)]))
`], { input: JSON.stringify([query, parameters, category, ids]), encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const expected = category === 'clients' ? (ids.length ? [2] : [1, 2]) : (ids.length ? [6] : [5, 6]);
      assert.deepEqual(JSON.parse(result.stdout), expected);
    }
  }
});
