"""Dependency-free tests of search permission, privacy and screen pagination."""
import ast
from contextlib import contextmanager
import inspect
import logging
from pathlib import Path
import re
import unittest

class HTTPError(Exception):
    def __init__(self, status, detail):
        self.status_code = status

class Default:
    def __init__(self, value):
        self.default = value

# Load the actual search logic without requiring the API deployment dependencies.
tree = ast.parse(Path(__file__).with_name('global_search.py').read_text())
tree.body = [node for node in tree.body if not isinstance(node, (ast.Import, ast.ImportFrom))]
module = dict(inspect=inspect, logging=logging, re=re, HTTPException=HTTPError,
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
        @contextmanager
        def db():
            class Connection:
                def cursor(self): return None
            yield Connection()
        def clients(current_user, skip, limit):
            self.calls.append(skip)
            return [dict(id=i+1, name='Person', phone='******', can_view_sensitive=False,
                         notes='hidden-secret', password='never') for i in range(skip, min(skip+limit, 221))]
        env = dict(get_current_user=lambda: None, get_db=db,
                   get_user_mobile_feature_flag_values=lambda c, u: self.flags,
                   get_client_leads=clients)
        router = Router()
        module['register_routes'](router, env)
        self.search = router.search
        self.user = dict(id=7, username='vsawariya', role='employee')
    def run_search(self, q, **kw):
        return self.search(q=q, exact=kw.get('exact', False), page=kw.get('page', 1),
                           source=kw.get('source', 'clients'), current_user=kw.get('user', self.user))
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
        self.assertEqual(self.calls, [0, 200])
        self.assertNotIn('password', result['items'][0]['row'])
    def test_masked_private_metadata_never_matches(self):
        self.assertEqual(self.run_search('hidden-secret')['groups']['clients']['total'], 0)
    def test_matching(self):
        match = module['matches']
        self.assertTrue(match(dict(phone='+91 (96542)-28808'), '919654228808', True))
        self.assertFalse(match(dict(name='Person'), 'Per', True))
        self.assertTrue(match(dict(name='Person'), 'per'))
        self.assertFalse(match(dict(name='Person'), '%'))
        self.assertTrue(match(dict(name='100%_'), '100%_', True))
    def test_short_query_does_not_read(self):
        self.assertEqual(self.run_search('x')['groups'], {})
        self.assertEqual(self.calls, [])

if __name__ == '__main__': unittest.main()
