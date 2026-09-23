"""Assignment validation tests without a live database."""
import ast
from contextlib import contextmanager
from pathlib import Path
import unittest

class HTTPException(Exception):
    def __init__(self, status_code, detail): self.status_code = status_code

class Cursor:
    def __init__(self, active=True, lead=True):
        self.active, self.lead, self.queries = active, lead, []
    def execute(self, query, params=None): self.queries.append((query, params))
    def fetchone(self):
        return {'id': 2} if ('FROM users' in self.queries[-1][0] and self.active) or ('FROM leads' in self.queries[-1][0] and self.lead) else None

class Connection:
    def __init__(self, cursor): self.c = cursor; self.committed = False; self.rolled_back = False
    def cursor(self): return self.c
    def commit(self): self.committed = True
    def rollback(self): self.rolled_back = True

def load(cursor, columns={'is_active', 'is_deleted'}):
    conn = Connection(cursor)
    @contextmanager
    def db(): yield conn
    nodes = [n for n in ast.parse(Path(__file__).with_name('server.py').read_text()).body if isinstance(n, ast.FunctionDef) and n.name in {'active_assignment_user_condition', 'assign_lead_to_member'}]
    for node in nodes:
        node.decorator_list = []
        node.args.defaults = []
    scope = {'get_db': db, '_table_columns': lambda *_: columns, 'ensure_collaboration_tables': lambda _: None, 'HTTPException': HTTPException}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'server.py', 'exec'), scope)
    return scope, conn

class AssignmentTests(unittest.TestCase):
    def test_rejects_non_admin(self):
        cursor = Cursor(); scope, conn = load(cursor)
        with self.assertRaises(HTTPException) as error:
            scope['assign_lead_to_member'](1, 2, {'id': 3, 'role': 'caller'})
        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(cursor.queries, [])

    def test_inactive_user_or_missing_lead_never_changes_assignment(self):
        for cursor in [Cursor(active=False), Cursor(lead=False)]:
            scope, conn = load(cursor)
            with self.assertRaises(HTTPException): scope['assign_lead_to_member'](1, 2, {'id': 3, 'role': 'admin'})
            self.assertTrue(conn.rolled_back)
            self.assertFalse(any('DELETE' in query for query, _ in cursor.queries))

    def test_assignment_checks_active_user_and_commits_both_records(self):
        cursor = Cursor(); scope, conn = load(cursor)
        scope['assign_lead_to_member'](1, 2, {'id': 3, 'role': 'admin'})
        self.assertIn('is_active = 1', cursor.queries[0][0])
        self.assertIn('is_deleted != 1', cursor.queries[0][0])
        self.assertTrue(conn.committed)
        self.assertEqual(cursor.queries[-1][1], (2, 1))

    def test_legacy_schema_omits_absent_flags(self):
        scope, _ = load(Cursor(), set())
        self.assertEqual(scope['active_assignment_user_condition'](None), 'id <> 9')

if __name__ == '__main__': unittest.main()
