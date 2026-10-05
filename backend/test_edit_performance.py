"""Query/setup budgets and fresh authorization without a production database."""
import ast
from contextlib import contextmanager
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch
import unittest
import schema_setup
from test_inventory_updates import HTTPError


def load(names, **scope):
    nodes = [n for n in ast.parse(Path(__file__).with_name('server.py').read_text()).body
             if isinstance(n, ast.FunctionDef) and n.name in names]
    for node in nodes:
        node.decorator_list = []
    env = dict(Depends=lambda _: None, get_current_user=lambda: None, HTTPException=HTTPError)
    env.update(scope)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'server.py', 'exec'), env)
    return env


class SchemaSetupTests(unittest.TestCase):
    def setUp(self):
        schema_setup._ready.clear(); schema_setup._metadata.clear()

    def test_setup_is_once_across_parallel_requests(self):
        setup = Mock()
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda _: schema_setup.ensure_once('collaboration', setup), range(20)))
        setup.assert_called_once()

    def test_real_collaboration_guard_skips_all_schema_queries_after_setup(self):
        cursor = Mock()
        scope = load({'ensure_collaboration_tables', '_create_collaboration_tables'}, schema_setup=schema_setup)
        scope['ensure_collaboration_tables'](cursor)
        first_count = cursor.execute.call_count
        self.assertEqual(first_count, 8)
        for _ in range(10): scope['ensure_collaboration_tables'](cursor)
        self.assertEqual(cursor.execute.call_count, first_count)

    def test_failed_setup_is_retried(self):
        setup = Mock(side_effect=[RuntimeError('database unavailable'), None])
        with self.assertRaises(RuntimeError): schema_setup.ensure_once('collaboration', setup)
        schema_setup.ensure_once('collaboration', setup)
        schema_setup.ensure_once('collaboration', setup)
        self.assertEqual(setup.call_count, 2)

    def test_metadata_cache_expires_and_cannot_be_mutated_by_callers(self):
        source = Mock(return_value={'id'})
        @schema_setup.cache_metadata
        def columns(cursor, table): return source()
        with patch.object(schema_setup, 'monotonic', return_value=100):
            columns(None, 'leads').add('bad')
            self.assertEqual(columns(None, 'leads'), {'id'})
            source.assert_called_once()
        with patch.object(schema_setup, 'monotonic', return_value=161):
            columns(None, 'leads')
        self.assertEqual(source.call_count, 2)


class FormLoadingTests(unittest.TestCase):
    def test_edit_data_omits_matches_calculations_and_extra_connections(self):
        for lead_type in ('buyer', 'tenant', 'seller', 'builder'):
            with self.subTest(lead_type=lead_type):
                cursor = Mock(); cursor.fetchone.return_value = dict(id=1, created_by=7, lead_type=lead_type, phone='12345')
                cursor.fetchall.return_value = [{'floor_label': 'Ground', 'floor_amount': 1}]
                conn = Mock(); conn.cursor.return_value = cursor
                connections = []
                @contextmanager
                def db(): connections.append(1); yield conn
                scope = load({'get_lead_edit_data'}, get_db=db, ensure_collaboration_tables=lambda _: None,
                             current_assignee_map=lambda *_: {}, should_mask_data=lambda *_: False,
                             apply_lead_masking=lambda lead, *_: lead)
                result = scope['get_lead_edit_data'](1, {'id': 7, 'role': 'agent'})
                self.assertEqual(len(connections), 1)
                self.assertEqual(cursor.execute.call_count, 2)
                self.assertEqual(result['floor_pricing'][0]['floor_label'], 'Ground')
                self.assertNotIn('matched_properties', result)
                self.assertNotIn('calculations', result)

    def test_edit_rechecks_permission_every_time_and_does_not_use_contact_approval(self):
        cursor = Mock(); cursor.fetchone.side_effect = [dict(id=1, created_by=7), dict(id=1, created_by=8)]
        cursor.fetchall.return_value = []
        conn = Mock(); conn.cursor.return_value = cursor
        @contextmanager
        def db(): yield conn
        scope = load({'get_lead_edit_data'}, get_db=db, ensure_collaboration_tables=lambda _: None,
                     current_assignee_map=lambda *_: {}, should_mask_data=lambda role, user, creator, *_: user != creator,
                     apply_lead_masking=lambda lead, *_: lead)
        scope['get_lead_edit_data'](1, {'id': 7, 'role': 'agent'})
        with self.assertRaises(HTTPError) as caught:
            scope['get_lead_edit_data'](1, {'id': 7, 'role': 'agent'})
        self.assertEqual(caught.exception.status_code, 403)

    def test_popup_read_queries_do_not_lock_but_writes_still_do(self):
        cursor = Mock(); cursor.fetchone.return_value = dict(id=1, lead_type='builder', status='approved')
        cursor.fetchall.return_value = []
        scope = load({'inventory_snapshot', 'inventory_permission', 'lock_inventory'},
                     current_assignee_map=lambda *_: {}, should_mask_data=lambda *_: True)
        for lock in (False, True):
            cursor.reset_mock()
            lead = scope['lock_inventory'](cursor, 1, lock=lock)
            scope['inventory_permission'](cursor, lead, {'id': 7, 'role': 'agent'}, lock=lock)
            scope['inventory_snapshot'](cursor, lead, lock=lock)
            self.assertEqual(cursor.execute.call_count, 3)
            for call in cursor.execute.call_args_list:
                self.assertEqual('FOR UPDATE' in call.args[0], lock)

    def test_owner_popup_permission_does_not_query_assignments_or_requests(self):
        cursor = Mock()
        scope = load({'inventory_permission'}, should_mask_data=lambda *_: False)
        self.assertTrue(scope['inventory_permission'](cursor, {'id': 1, 'created_by': 7}, {'id': 7}))
        cursor.execute.assert_not_called()

if __name__ == '__main__': unittest.main()
