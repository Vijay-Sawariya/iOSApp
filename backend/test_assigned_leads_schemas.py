"""Execute the assigned-leads query against old web and newer mobile layouts."""
import ast
from contextlib import contextmanager
from datetime import datetime, date
from pathlib import Path
import sqlite3
from typing import Any, List
import unittest


def handler(db):
    class Cursor:
        def execute(self, query, params=()):
            if any(word in query.upper() for word in ['CREATE TABLE', 'ALTER TABLE']):
                raise AssertionError('Assigned Leads must be read-only')
            self.result = db.execute(query.replace('%s', '?'), params)
        def fetchall(self): return [dict(row) for row in self.result.fetchall()]
    class Connection:
        def cursor(self): return Cursor()
    @contextmanager
    def get_db(): yield Connection()
    tree = ast.parse(Path(__file__).with_name('server.py').read_text())
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in {'get_mobile_assigned_leads', '_lead_summary'}]
    for node in nodes:
        node.decorator_list = []
        if node.name == 'get_mobile_assigned_leads': node.args.defaults = node.args.defaults[-1:]
    scope = dict(Any=Any, List=List, datetime=datetime, date=date, get_db=get_db,
                 _table_columns=lambda _, table: {row['name'] for row in db.execute(f'PRAGMA table_info({table})')},
                 apply_lead_masking=lambda row, *_: row)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'server.py', 'exec'), scope)
    return scope


class AssignedSchemaTests(unittest.TestCase):
    def database(self, mobile=False, deleted=False):
        db = sqlite3.connect(':memory:')
        db.row_factory = sqlite3.Row
        db.executescript('CREATE TABLE users (id INTEGER, full_name TEXT, username TEXT); INSERT INTO users VALUES (7, "Agent", "agent"), (8, "Other", "other");')
        db.execute('CREATE TABLE leads (id INTEGER, name TEXT, created_by INTEGER, created_at TEXT' + (', assigned_to INTEGER' if mobile else '') + (', is_deleted INTEGER' if deleted else '') + ')')
        db.execute('CREATE TABLE lead_assignments (lead_id INTEGER, user_id INTEGER, assigned_at TEXT' + (', id INTEGER' if mobile else '') + ')')
        db.execute('INSERT INTO leads (id, name, created_by, created_at) VALUES (1, "Test", 8, "2026-09-23 10:00:00")')
        db.execute('INSERT INTO lead_assignments (lead_id, user_id, assigned_at) VALUES (1, 7, "2026-09-23 11:00:00")')
        return db

    def test_web_schema_without_id_or_legacy_owner(self):
        db = self.database()
        fn = handler(db)['get_mobile_assigned_leads']
        self.assertEqual(fn({'id': 7, 'role': 'caller'})[0]['assigned_to_name'], 'Agent')
        self.assertEqual(fn({'id': 8, 'role': 'caller'}), [])
        self.assertEqual(len(fn({'id': 8, 'role': 'admin'})), 1)
        db.close()

    def test_mobile_schema_fallback_and_deleted_filter(self):
        db = self.database(mobile=True, deleted=True)
        db.execute('INSERT INTO leads VALUES (2, "Legacy", 8, "2026-09-22", 7, 0)')
        db.execute('INSERT INTO leads VALUES (3, "Deleted", 8, "2026-09-24", 7, 1)')
        fn = handler(db)['get_mobile_assigned_leads']
        self.assertEqual([r['id'] for r in fn({'id': 7, 'role': 'caller'})], [1, 2])
        db.close()

    def test_legacy_only_and_no_assignment_schema(self):
        db = self.database(mobile=True)
        db.execute('DROP TABLE lead_assignments')
        db.execute('UPDATE leads SET assigned_to = 7')
        self.assertEqual(len(handler(db)['get_mobile_assigned_leads']({'id': 7, 'role': 'caller'})), 1)
        db.close()
        db = self.database()
        db.execute('DROP TABLE lead_assignments')
        self.assertEqual(handler(db)['get_mobile_assigned_leads']({'id': 7, 'role': 'caller'}), [])
        db.close()

    def test_summary_accepts_driver_date_objects_strings_and_null(self):
        db = self.database()
        fn = handler(db)['_lead_summary']
        for value, expected in [(datetime(2026, 9, 23), '2026-09-23T00:00:00'), ('2026-09-23', '2026-09-23'), ('0000-00-00 00:00:00', '0000-00-00 00:00:00'), (None, None)]:
            self.assertEqual(fn({'id': 1, 'created_at': value}, 'admin', 7)['created_at'], expected)
        db.close()

if __name__ == '__main__': unittest.main()
