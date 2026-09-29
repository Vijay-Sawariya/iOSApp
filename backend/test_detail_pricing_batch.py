"""Lead detail loads all matched prices in one query and retains masking."""
import ast
from contextlib import contextmanager
from pathlib import Path
from typing import List
import unittest


class DetailPricingTests(unittest.TestCase):
    def test_multiple_matches_use_one_pricing_query_and_preserve_masking(self):
        queries = []

        class Cursor:
            def execute(self, query, params=None):
                queries.append((query, params))

            def fetchone(self):
                return {'id': 1, 'lead_type': 'buyer'}

            def fetchall(self):
                query = queries[-1][0]
                if 'FROM preferred_leads' in query:
                    return [{'property_id': i, 'property_address': 'Private address', 'property_phone': '1234567890'} for i in [2, 3]]
                if 'WHERE lead_id IN' in query:
                    return [{'lead_id': i, 'floor_label': 'Kothi', 'floor_amount': i} for i in [2, 3]]
                return []

        class Connection:
            def cursor(self): return Cursor()

        @contextmanager
        def get_db():
            yield Connection()

        names = {'get_lead', '_get_floor_pricing_map'}
        tree = ast.parse(Path(__file__).with_name('server.py').read_text())
        nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
        for node in nodes:
            node.decorator_list = []
        scope = dict(List=List, Depends=lambda _: None, get_current_user=lambda: None,
                     get_db=get_db, ensure_collaboration_tables=lambda _: None,
                     attach_current_assignees=lambda *_: None, get_detail_access_map=lambda *_: {},
                     assignment_contact_map=lambda *_: {}, should_mask_data=lambda *_: True,
                     mask_phone=lambda _: '***', mask_address=lambda _: '***',
                     apply_lead_masking=lambda response, *_: response)
        exec(compile(ast.Module(body=nodes, type_ignores=[]), 'server.py', 'exec'), scope)
        result = scope['get_lead'](1, current_user={'id': 5, 'role': 'agent'})
        batch_queries = [(q, p) for q, p in queries if 'WHERE lead_id IN' in q]
        self.assertEqual(len(batch_queries), 1)
        self.assertEqual(batch_queries[0][1], [2, 3])
        for prop in result['matched_properties']:
            self.assertEqual(prop['floor_pricing'][0]['floor_amount'], prop['property_id'])
            self.assertEqual(prop['property_address'], '***')
            self.assertFalse(prop['can_view_sensitive'])


if __name__ == '__main__':
    unittest.main()
