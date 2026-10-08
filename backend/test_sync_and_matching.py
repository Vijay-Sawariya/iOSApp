"""Offline replay and matching regressions without production database access."""
import ast
import re
import unittest
from contextlib import contextmanager
from pathlib import Path
from typing import List, Optional
from unittest.mock import Mock

class HTTPError(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        super().__init__(detail)


def load(cursor):
    connection = Mock()
    connection.cursor.return_value = cursor
    @contextmanager
    def get_db(): yield connection
    names = {'update_lead', '_is_unavailable_inventory', 'get_matching_inventory', 'get_smart_matches',
             '_split_csv', '_normalize_floor_token', '_normalize_floor_list', '_parse_multi_param',
             '_float_or_none', '_lead_price_range', '_ranges_overlap', '_location_matches',
             '_floor_matches', '_matching_defaults'}
    nodes = [node for node in ast.parse(Path(__file__).with_name('server.py').read_text()).body
             if isinstance(node, ast.FunctionDef) and node.name in names]
    for node in nodes: node.decorator_list = []
    scope = dict(re=re, List=List, Optional=Optional, Depends=lambda _: None, get_current_user=lambda: None,
                 get_db=get_db, HTTPException=HTTPError, ensure_collaboration_tables=lambda _: None,
                 ensure_whatsapp_tracking_columns=lambda _: None,
                 current_assignee_map=lambda *args: {}, should_mask_data=lambda *args: False,
                 attach_current_assignees=lambda *args: None, get_detail_access_map=lambda *args: {},
                 apply_lead_masking=lambda lead, *args: lead, _get_floor_pricing_map=lambda *args: {})
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'server.py', 'exec'), scope)
    return scope

class SyncAndMatchingTests(unittest.TestCase):
    def test_unchanged_inventory_update_succeeds(self):
        cursor = Mock(rowcount=0)
        cursor.fetchone.side_effect = [{'created_by': 7}, {'id': 42, 'name': 'Property'}]
        result = load(cursor)['update_lead'](42, {'name': 'Property'}, {'id': 7, 'role': 'admin'})
        self.assertEqual(result['id'], 42)

    def test_missing_inventory_still_returns_404(self):
        cursor = Mock()
        cursor.fetchone.return_value = None
        with self.assertRaises(HTTPError) as error:
            load(cursor)['update_lead'](42, {'name': 'Property'}, {'id': 7})
        self.assertEqual(error.exception.status_code, 404)

    def test_matching_excludes_closed_even_when_preferred(self):
        cursor = Mock()
        cursor.fetchone.return_value = {'id': 1}
        statuses = ['Sold', ' SOLD ', 'Not Available', 'Un-available', 'Ready, Sold', 'Ready|Not-Available', 'Available', None]
        candidates = [{'id': i + 2, 'lead_status': status} for i, status in enumerate(statuses)]
        cursor.fetchall.side_effect = [candidates, [{'matching_lead_id': row['id']} for row in candidates]]
        result = load(cursor)['get_matching_inventory'](1, current_user={'id': 7, 'role': 'admin'})
        self.assertEqual([row['lead_status'] for row in result['matches']], ['Available', None])

    def test_smart_matching_excludes_unavailable_properties(self):
        cursor = Mock()
        buyer = {'id': 1, 'name': 'Buyer', 'location': 'Delhi'}
        candidates = [{'id': i + 2, 'name': 'Property', 'location': 'Delhi', 'lead_status': status}
                      for i, status in enumerate(['Sold', 'Not Available', 'Unavailable', 'Ready / Sold', 'Available'])]
        cursor.fetchall.side_effect = [[buyer], candidates, []]
        result = load(cursor)['get_smart_matches'](current_user={'id': 7, 'role': 'admin'})
        self.assertEqual([row['inventory_status'] for row in result], ['Available'])

if __name__ == '__main__': unittest.main()
