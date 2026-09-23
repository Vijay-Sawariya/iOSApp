"""Regression coverage for MySQL metadata casing on Assigned Leads."""
import ast
from contextlib import contextmanager
from pathlib import Path
from typing import Any, List
import unittest


class Cursor:
    def __init__(self, metadata_key):
        self.metadata_key = metadata_key
        self.queries = []

    def execute(self, query, params=None):
        self.queries.append((query, params))

    def fetchall(self):
        if 'information_schema.columns' in self.queries[-1][0]:
            return [{self.metadata_key: name} for name in ['id', 'assigned_at', 'assigned_to', 'lead_id', 'user_id']]
        return [{'id': 12, 'name': 'Assigned buyer', 'lead_type': 'buyer'}]


def load_functions(cursor):
    class Connection:
        def cursor(self): return cursor
        def commit(self): pass

    @contextmanager
    def get_db():
        yield Connection()

    tree = ast.parse(Path(__file__).with_name('server.py').read_text())
    nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef)
             and node.name in {'_table_columns', 'get_mobile_assigned_leads'}]
    for node in nodes:
        node.decorator_list = []
        if node.name == 'get_mobile_assigned_leads':
            node.args.defaults = node.args.defaults[-1:]
    scope = dict(List=List, Any=Any, get_db=get_db,
                 ensure_collaboration_tables=lambda _: None,
                 attach_current_assignees=lambda *_: None,
                 _lead_summary=lambda row, *_: row)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'server.py', 'exec'), scope)
    return scope


class SchemaMetadataTests(unittest.TestCase):
    def test_column_labels_accept_mysql_casing(self):
        for key in ['COLUMN_NAME', 'column_name', 'Column_Name']:
            with self.subTest(key=key):
                cursor = Cursor(key)
                columns = load_functions(cursor)['_table_columns'](cursor, 'leads')
                self.assertEqual(columns, {'id', 'assigned_at', 'assigned_to', 'lead_id', 'user_id'})
                self.assertIn('COLUMN_NAME AS column_name', cursor.queries[0][0])
                self.assertEqual(cursor.queries[0][1], ('leads',))

    def test_assigned_leads_loads_with_uppercase_metadata(self):
        for role in ['admin', 'caller']:
            with self.subTest(role=role):
                cursor = Cursor('COLUMN_NAME')
                result = load_functions(cursor)['get_mobile_assigned_leads']({'id': 7, 'role': role}, 900)
                self.assertEqual(result[0]['id'], 12)
                query, params = cursor.queries[-1]
                self.assertIn('la.assigned_at DESC, la.id DESC', query)
                self.assertEqual(params, [500] if role == 'admin' else [7, 7, 500])


if __name__ == '__main__':
    unittest.main()
