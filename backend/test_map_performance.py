"""Map URL classification and summary-only performance query regression tests."""
import ast
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
import unittest


class Cursor:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.queries = []

    def execute(self, query, params=None):
        self.queries.append((query, params))

    def fetchone(self):
        return {'id': 1} if 'FROM users WHERE' in self.queries[-1][0] else {}

    def fetchall(self):
        return self.rows


def handler(name, cursor):
    class Connection:
        def cursor(self): return cursor
        def commit(self): pass

    @contextmanager
    def get_db():
        yield Connection()

    tree = ast.parse(Path(__file__).with_name('server.py').read_text())
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    node.decorator_list = []
    scope = dict(Optional=Optional, datetime=datetime, timedelta=timedelta,
                 Depends=lambda _: None, get_current_user=lambda: None, get_db=get_db,
                 ensure_action_assignment_column=lambda _: None,
                 ensure_collaboration_tables=lambda _: None,
                 attach_current_assignees=lambda *_: None,
                 apply_lead_masking_batch=lambda _, rows, user: rows,
                 _table_exists=lambda *_: False)
    exec(compile(ast.Module(body=[node], type_ignores=[]), 'server.py', 'exec'), scope)
    return scope[name]


class MapPerformanceTests(unittest.TestCase):
    def test_map_classifies_saved_urls_including_url_only_inventory(self):
        cursor = Cursor([{'Property_locationUrl': ' https://maps.app.goo.gl/example ', 'location': None},
                         {'Property_locationUrl': '  '}, {'Property_locationUrl': None}])
        result = handler('get_leads_for_map', cursor)(current_user={'id': 1})
        self.assertEqual([row['has_map_url'] for row in result], [True, False, False])
        query = cursor.queries[0][0]
        self.assertIn("OR NULLIF(TRIM(l.Property_locationUrl), '') IS NOT NULL", query)
        self.assertIn("l.lead_type IN ('seller', 'builder', 'landlord', 'agent')", query)

    def test_summary_skips_all_detail_queries(self):
        cursor = Cursor()
        result = handler('get_mobile_performance', cursor)(current_user={'id': 1, 'role': 'admin'})
        self.assertEqual(len(cursor.queries), 7)
        self.assertFalse(any('LIMIT 5000' in query for query, _ in cursor.queries))
        self.assertTrue(all(value == [] for value in result['details'].values()))

    def test_each_detail_only_runs_its_requested_query(self):
        for metric in ['due_completed', 'completion', 'on_time', 'portfolio', 'new_leads', 'won', 'current_overdue']:
            with self.subTest(metric=metric):
                cursor = Cursor()
                handler('get_mobile_performance', cursor)(detail_metric=metric, current_user={'id': 1, 'role': 'admin'})
                self.assertEqual(sum('LIMIT 5000' in query for query, _ in cursor.queries), 1)


if __name__ == '__main__':
    unittest.main()
