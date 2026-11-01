"""Offline parity tests for web/iOS inventory-to-client matching."""
import ast
from contextlib import contextmanager
from pathlib import Path
from typing import List, Optional
from unittest import TestCase, main
from unittest.mock import Mock
import inventory_recipient_matching as matching


class RecipientMatchingTests(TestCase):
    def setUp(self):
        self.inventory = {'id': 1, 'lead_type': 'seller', 'location': 'GK 1', 'area_size': 208,
                          'floor': 'GF', 'budget_min': 6.5, 'budget_max': 6.5, 'unit': 'CR'}
        self.buyer = {'id': 2, 'lead_type': 'buyer', 'location': 'GK 2, G.K. 1', 'area_size': 208,
                      'floor': 'Ground Floor', 'budget_min': 600, 'budget_max': 700, 'unit': 'L'}
        self.filters = matching.defaults(self.inventory, [])

    def test_equivalent_units_location_floor_and_default_tolerance(self):
        self.assertEqual((self.filters['area_min'], self.filters['area_max']), (158, 258))
        self.assertEqual(self.filters['budget_min'], 6.5)
        self.assertEqual(matching.reasons(self.inventory, self.buyer, self.filters), ['Location', 'Area', 'Budget', 'Floor'])
        self.assertIsNotNone(matching.reasons(self.inventory, dict(self.buyer, area_size=1872, area_unit='SQFT'), self.filters))

    def test_mismatches_and_budget_allowance_applied_once(self):
        for field, value in [('location', 'GK 2'), ('floor', 'First Floor'), ('area_size', 300)]:
            with self.subTest(field=field):
                self.assertIsNone(matching.reasons(self.inventory, dict(self.buyer, **{field:value}), self.filters))
        self.assertIsNone(matching.reasons(self.inventory, dict(self.buyer, budget_min=400, budget_max=500), self.filters))

    def test_rent_units_and_target_types(self):
        inventory = dict(self.inventory, lead_type='landlord', unit='L', budget_min=1.2, budget_max=1.2)
        tenant = dict(self.buyer, lead_type='rent', unit='K', budget_min=100, budget_max=150)
        self.assertIsNotNone(matching.reasons(inventory, tenant, matching.defaults(inventory, [])))
        self.assertEqual(matching.target_types(inventory), ['tenant', 'rent'])
        self.assertEqual(matching.target_types(dict(inventory, lead_type='agent'), 'rent'), ['tenant', 'rent'])
        self.assertEqual(matching.target_types(self.inventory), ['buyer'])

    def test_open_budget_any_floor_and_combined_floor(self):
        filters = dict(self.filters, budget_min=2, budget_max=2)
        self.assertIsNotNone(matching.reasons(self.inventory, dict(self.buyer, budget_min=0, floor='Any Floor'), filters))
        self.assertEqual(matching.floors('TF + Terrace'), matching.floors('TFT'))
        self.assertEqual(matching.locations('GK 1'), matching.locations('G.K.-1'))
        self.assertNotEqual(matching.locations('C-6/9'), matching.locations('C-69'))

    def test_floor_wise_defaults(self):
        defaults = matching.defaults(self.inventory, [{'floor_label':'FF','floor_amount':7}, {'floor_label':'SF','floor_amount':8}])
        self.assertEqual((defaults['budget_min'], defaults['budget_max']), (7, 8))
        self.assertEqual(defaults['floors'], ['GF', 'FF', 'SF'])

    def endpoint(self, candidates):
        cursor = Mock()
        cursor.fetchone.return_value = self.inventory
        cursor.fetchall.side_effect = [candidates, [{'lead_id':2}]]
        connection = Mock()
        connection.cursor.return_value = cursor
        @contextmanager
        def get_db(): yield connection
        names = {'get_matching_clients', '_parse_multi_param'}
        nodes = [node for node in ast.parse(Path(__file__).with_name('server.py').read_text()).body
                 if isinstance(node, ast.FunctionDef) and node.name in names]
        for node in nodes: node.decorator_list = []
        scope = dict(List=List, Optional=Optional, Depends=lambda _:None, get_current_user=lambda:None,
                     get_db=get_db, inventory_recipient_matching=matching,
                     _get_floor_pricing_map=lambda *args:{}, attach_current_assignees=lambda *args:None,
                     get_detail_access_map=lambda *args:{2:{'approved':True}},
                     apply_lead_masking=lambda item,*args:dict(item, masked=True))
        exec(compile(ast.Module(body=nodes, type_ignores=[]), 'server.py', 'exec'), scope)
        return scope['get_matching_clients'], cursor

    def test_endpoint_returns_all_matches_and_preserves_masking_preferred(self):
        endpoint, cursor = self.endpoint([dict(self.buyer, id=i) for i in range(2, 105)])
        result = endpoint(1, current_user={'id':7, 'role':'agent'})
        self.assertEqual(len(result['matches']), 103)
        self.assertTrue(result['matches'][0]['is_preferred'])
        self.assertTrue(all(row['masked'] for row in result['matches']))
        query = cursor.execute.call_args_list[1].args[0]
        self.assertNotIn('LIMIT', query)
        self.assertNotIn('l.created_by =', query)
        self.assertIn('l.is_deleted IS NULL', query)

    def test_cleared_filters_remain_unrestricted(self):
        endpoint, _ = self.endpoint([dict(self.buyer, floor='FF', location='Other', area_size=900)])
        result = endpoint(1, filters_submitted=True, current_user={'id':7})
        self.assertEqual(len(result['matches']), 1)
        self.assertEqual(result['filters']['locations'], [])
        self.assertIsNone(result['filters']['budget_min'])

if __name__ == '__main__': main()
