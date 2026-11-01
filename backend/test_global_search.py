"""Dependency-free tests of search permission, privacy and screen pagination."""
import ast
from contextlib import contextmanager
import inspect
import logging
from pathlib import Path
import re
import unittest
from global_search_queries import rows as search_rows, candidate_clause

class HTTPError(Exception):
    def __init__(self, status, detail):
        self.status_code = status

class Default:
    def __init__(self, value):
        self.default = value

# Load the actual search logic without requiring the API deployment dependencies.
tree = ast.parse(Path(__file__).with_name('global_search.py').read_text())
tree.body = [node for node in tree.body if not isinstance(node, (ast.Import, ast.ImportFrom))]
module = dict(search_rows=search_rows, inspect=inspect, logging=logging, re=re, HTTPException=HTTPError,
              Depends=lambda f: Default(f), Query=lambda value, **kw: Default(value))
exec(compile(tree, 'global_search.py', 'exec'), module)

class Router:
    def __init__(self): self.routes = []
    def get(self, path):
        def decorate(fn): self.search = fn; return fn
        return decorate

class SearchTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.flags = {'buyer_leads': True}
        test = self
        class Cursor:
            def execute(self, sql, args):
                test.calls.append((sql, args))
                self.last_id = args[0]
            def fetchall(self):
                return [dict(id=i+1, name='Person', phone='******', can_view_sensitive=False,
                             notes='hidden-secret', password='never')
                        for i in range(self.last_id, min(self.last_id+200, 221))]
        @contextmanager
        def db():
            class Connection:
                def cursor(self): return Cursor()
            yield Connection()
        env = dict(get_current_user=lambda: None, get_db=db,
                   get_user_mobile_feature_flag_values=lambda c, u: self.flags,
                   _table_columns=lambda c,t: {'id','name','phone','notes'},
                   attach_current_assignees=lambda c,r: r,
                   apply_lead_masking_batch=lambda c,r,u: r)
        router = Router()
        module['register_routes'](router, env)
        self.search = router.search
        self.user = dict(id=7, username='vsawariya', role='employee')
    def run_search(self, q, **kw):
        return self.search(q=q, exact=kw.get('exact', False), page=kw.get('page', 1),
                           source=kw.get('source', 'clients'), sources_only=kw.get('sources_only', False), current_user=kw.get('user', self.user))
    def test_authorization_before_queries(self):
        for user in ({}, dict(id=7, username='other', role='admin'), dict(id=0, username='vsawariya')):
            with self.assertRaises(HTTPError) as error: self.run_search('Person', user=user)
            self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(self.calls, [])
    def test_disabled_source_not_read(self):
        self.flags['buyer_leads'] = False
        self.assertEqual(self.run_search('Person')['groups'], {})
        self.assertEqual(self.calls, [])
    def test_pagination_reads_beyond_first_screen_page(self):
        result = self.run_search('Person', page=12)['groups']['clients']
        self.assertEqual(result['total'], 221)
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(result['items'][0]['url'], '/leads/221')
        self.assertEqual([args[0] for sql, args in self.calls], [0, 200])
        self.assertTrue(all('LIKE %s' in sql and 's.id>%s' in sql for sql, args in self.calls))
        self.assertNotIn('password', result['items'][0]['row'])
    def test_masked_private_metadata_never_matches(self):
        self.assertEqual(self.run_search('hidden-secret')['groups']['clients']['total'], 0)
    def test_manifest_lists_only_enabled_sources_without_scanning(self):
        result = self.run_search('Person', sources_only=True)
        self.assertEqual(result['sources'], [
            {'key': 'clients', 'label': 'Clients'},
            {'key': 'monthly', 'label': 'Monthly Inventory'}])
        self.assertEqual(self.calls, [])
        self.flags['buyer_leads'] = False
        self.assertEqual(len(self.run_search('Person', sources_only=True)['sources']), 1)

    def test_matching(self):
        match = module['matches']
        self.assertTrue(match(dict(phone='+91 (96542)-28808'), '919654228808', True))
        self.assertFalse(match(dict(name='Person'), 'Per', True))
        self.assertTrue(match(dict(name='Person'), 'per'))
        self.assertFalse(match(dict(name='Person'), '%'))
        self.assertTrue(match(dict(name='100%_'), '100%_', True))
    def test_address_queries_return_visible_details(self):
        match = module['matches']
        for term in ('R-50', 'F-18'):
            for address in (term, term.replace('-', ' '), term.replace('-', ''), term.replace('-', '–')):
                self.assertTrue(match({'address': address}, term, True))
            self.assertFalse(match({'address': 'Different address'}, term))
        class Cursor:
            def execute(self, sql, args): pass
            def fetchall(self): return [{'id': 18, 'address': 'F 18', 'owner_name': 'Visible owner', 'phone': '12345'}]
        @contextmanager
        def db():
            class Connection:
                def cursor(self): return Cursor()
            yield Connection()
        # Exercise the real SQL candidate reader through the response serializer.
        self.search.__globals__['search_rows'] = search_rows
        router = Router()
        module['register_routes'](router, dict(get_current_user=lambda: None, get_db=db,
            get_user_mobile_feature_flag_values=lambda c,u: {},
            _table_columns=lambda c,t: {'id','address','owner_name','phone'}))
        result = router.search(q='F-18', exact=False, page=1, source='monthly',
            sources_only=False, current_user=self.user)
        item = result['groups']['monthly']['items'][0]
        self.assertEqual(item['row']['address'], 'F 18')
        self.assertEqual(item['row']['owner_name'], 'Visible owner')
        self.assertEqual(item['url'], '/monthly-inventory?entry_id=18')

    def test_candidate_query_is_parameterized_and_literal(self):
        clause, args = candidate_clause(['address', 'phone'], "a%_' OR 1=1")
        self.assertNotIn("OR 1=1", clause)
        self.assertIn("!%", args[0])
        self.assertIn("!_", args[0])

    def test_address_variants_and_formatted_phone_candidates(self):
        clause, args = candidate_clause(['address'], 'R-50')
        self.assertIn('REPLACE(', clause)
        self.assertIn('%r50%', args)
        clause, args = candidate_clause(['phone'], '96542-28808', True)
        self.assertIn('%9%6%5%4%2%2%8%8%0%8%', args)

    def test_lightweight_sources_use_candidate_sql_and_preserve_scope(self):
        queries = []
        class Cursor:
            def execute(self, sql, args): queries.append((sql, args))
            def fetchall(self): return [{'id': 9, 'name': 'R-50', 'address': 'R-50'}]
        @contextmanager
        def db():
            class Connection:
                def cursor(self): return Cursor()
            yield Connection()
        env = dict(get_db=db, _table_columns=lambda c,t: {'id','name','address','phone','assigned_to','lead_id','user_id'},
                   attach_current_assignees=lambda c,r: r, apply_lead_masking_batch=lambda c,r,u:r,
                   _lead_summary=lambda r,role,uid:r)
        fields = module['FIELDS']
        for source in ('clients','inventory','assigned','builders','contacts','monthly','cold','agent','ocr','enquiries'):
            queries.clear()
            self.assertEqual(len(list(search_rows(env, source, self.user, 'R-50', False, fields))), 1)
            sql, args = queries[0]
            self.assertIn('LIKE %s', sql)
            self.assertIn('LIMIT 200', sql)
            self.assertNotIn('R-50', sql)
            self.assertNotIn('followups', sql)
            self.assertNotIn('COUNT(', sql)
            if source == 'assigned':
                self.assertIn('mine.user_id=%s', sql)
                self.assertEqual(args[:2], [7,7])
            if source == 'contacts':
                self.assertIn('c.owner_id=%s', sql)
                self.assertEqual(args[0], 7)
            if source == 'enquiries':
                self.assertIn('e.assigned_to=%s', sql)
                self.assertEqual(args[0], 7)
                self.assertNotIn('UPDATE', sql)
            if source == 'monthly':
                self.assertNotIn('identity_hash', sql)

    def test_short_query_does_not_read(self):
        self.assertEqual(self.run_search('x')['groups'], {})
        self.assertEqual(self.calls, [])

if __name__ == '__main__': unittest.main()
