"""Isolated API tests: no credentials, network database or production mutations."""
import ast
import copy
import unittest
from contextlib import contextmanager
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel
from pymysql import Connection
import monthly_inventory as books

# Load the actual request model without importing server.py's startup integrations.
tree = ast.parse(Path(__file__).with_name('server.py').read_text())
model_node = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'LeadCreate')
model_scope = dict(BaseModel=BaseModel, Optional=Optional, List=List)
exec(compile(ast.Module(body=[model_node], type_ignores=[]), 'LeadCreate', 'exec'), model_scope)
LeadCreate = model_scope['LeadCreate']
USER = {'id': 7, 'username': 'vsawariya'}
ENTRY = dict(id=10, book_id=1, book_month='2026-10-01', category='residential_sale', owner_name='Owner',
             address='C-5', location='Anand Niketan', area_size='400', area_unit='YD', floor='BMT+GF+FF',
             configuration='4BR', phone='9811111111', note='Original note', converted_lead_id=None, is_deleted=0, identity_hash='a'*64)
PAYLOAD = dict(name='ANKUR ARORA', phone='9811111111', location='Anand Niketan', address='C-5', lead_type='seller',
               property_type='Builder Floor', unit='CR', area_size='400', floor='BMT+GF,FF', bhk='4 BHK',
               floor_pricing=[{'floor': 'BMT+GF', 'price': '5'}, {'floor': 'FF', 'price': '3'}])


class Database:
    def __init__(self):
        self.entry = dict(ENTRY)
        self.leads = []
        self.exclusions = []
        self.prices = []
        self.saved = None
        self.commits = 0
        self.rollbacks = 0
        self.fail = ''
        self.telecaller = []
        self.pdf = b'%PDF-1.4\n' + b'0' * (1024*1024 + 100)
        self.queries = []
        connection = Connection(defer_connect=True)
        connection.server_status = 0
        self.sql = connection.cursor()

    def begin(self):
        self.saved = copy.deepcopy((self.entry, self.leads, self.prices, self.exclusions))

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1
        self.entry, self.leads, self.prices, self.exclusions = self.saved

    def cursor(self):
        return self

    def execute(self, query, args=None):
        # Real MySQL placeholder interpolation catches broken LIKE/DATE_FORMAT escapes.
        self.sql.mogrify(query, args)
        self.queries.append(query)
        if self.fail and self.fail in query:
            raise RuntimeError('Simulated write failure')
        if query.startswith('INSERT INTO leads'):
            fields = [f.strip('`') for f in query.split('(', 1)[1].split(')', 1)[0].split(',')]
            self.lastrowid = 100
            self.leads.append(dict(zip(fields, args), id=100))
        elif query.startswith('INSERT INTO inventory_floor_pricing'):
            self.prices.append(args)
        elif query.startswith('INSERT INTO monthly_inventory_exclusions'):
            if args[:2] not in self.exclusions: self.exclusions.append(args[:2])
        elif 'SET e.is_deleted=1' in query:
            self.entry['is_deleted'] = 1
        elif query.startswith('SELECT e.identity_hash'):
            self.result = self.entry
        elif query.startswith("SHOW COLUMNS FROM monthly_inventory_entries LIKE 'inventory_status'"):
            self.result = {'Field': 'inventory_status'}
        elif query.startswith('UPDATE monthly_inventory_entries SET inventory_status='):
            self.entry.update(inventory_status=args[0], status_changed_by=args[1])
        elif query.startswith('UPDATE monthly_inventory_entries'):
            self.entry['converted_lead_id'] = args[0]
        elif 'FOR UPDATE' in query:
            self.result = self.entry
        elif query.startswith('SHOW TABLES'):
            self.result = {'table': 'telecaller_leads'} if self.telecaller else None
        elif 'FROM telecaller_leads' in query:
            self.result = self.telecaller
        elif 'FROM leads' in query:
            self.result = sorted(self.leads, key=lambda l: -l['id'])
        elif 'COUNT(*)' in query:
            self.result = {'total': 0 if self.entry['is_deleted'] else 1}
        elif 'CASE WHEN' in query:
            self.result = [] if self.entry['is_deleted'] else [dict(self.entry, entry_status='First book')]
        elif 'SELECT id,book_month,category FROM monthly_inventory_pdfs' in query:
            self.result = [dict(id=8, book_month=ENTRY['book_month'], category=ENTRY['category'])]
        elif 'DISTINCT DATE_FORMAT' in query:
            self.result = [{'month': '2026-10'}]
        elif 'OCTET_LENGTH' in query:
            self.result = {'size': len(self.pdf)}
        elif 'SUBSTRING' in query:
            self.result = {'chunk': self.pdf[args[0]-1:args[0]-1+args[1]]}
        elif 'FROM builders' in query:
            self.result = None
        else:
            raise AssertionError(query)

    def fetchone(self):
        return self.result

    def fetchall(self):
        return self.result


class MonthlyTests(unittest.TestCase):
    def setUp(self):
        self.db = Database()
        self.user = dict(USER)
        @contextmanager
        def get_db():
            yield self.db
        router = APIRouter(prefix='/api')
        books.register_routes(router, get_db, lambda: self.user, LeadCreate)
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)

    def test_access_is_exact_username_on_every_route(self):
        for name in ('admin', 'VSAWARIYA', 'vsawariya ', ''):
            self.user['username'] = name
            self.assertEqual(self.client.get('/api/monthly-inventory').status_code, 403)
            self.assertEqual(self.client.get('/api/monthly-inventory/pdfs/8').status_code, 403)
            self.assertEqual(self.client.post('/api/monthly-inventory/10/convert', json=PAYLOAD).status_code, 403)
            self.assertEqual(self.client.post('/api/monthly-inventory/10/delete').status_code, 403)
        self.assertEqual(self.db.queries, [])

    def test_status_save_restore_and_validation(self):
        for status in ('Sold', 'Hold', 'Invalid', 'Available'):
            response = self.client.post('/api/monthly-inventory/10/status', json={'inventory_status': status})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.db.entry['inventory_status'], status)
            self.assertEqual(self.db.entry['status_changed_by'], self.user['id'])
        self.assertEqual(self.client.post('/api/monthly-inventory/10/status', json={'inventory_status': 'unexpected'}).status_code, 422)
        self.user['username'] = 'another-user'
        self.assertEqual(self.client.post('/api/monthly-inventory/10/status', json={'inventory_status': 'Sold'}).status_code, 403)

    def test_status_write_failure_rolls_back(self):
        self.db.fail = 'SET inventory_status='
        with self.assertRaises(RuntimeError):
            self.client.post('/api/monthly-inventory/10/status', json={'inventory_status': 'Sold'})
        self.assertEqual(self.db.rollbacks, 1)
        self.assertNotIn('inventory_status', self.db.entry)

    def test_conversion_is_atomic_and_retry_is_idempotent(self):
        first = self.client.post('/api/monthly-inventory/10/convert', json=PAYLOAD)
        self.assertEqual(first.status_code, 200, first.text)
        second = self.client.post('/api/monthly-inventory/10/convert', json=PAYLOAD)
        self.assertTrue(second.json()['already_converted'])
        self.assertEqual(len(self.db.leads), 1)
        self.assertEqual(self.db.entry['converted_lead_id'], 100)
        self.assertEqual(self.db.prices, [(100, 'BMT+GF', 5), (100, 'FF', 3)])
        lead = self.db.leads[0]
        self.assertEqual((lead['source_type'], lead['area_size'], lead['created_by']), ('Inventory', '400', 7))
        self.assertEqual((lead['budget_min'], lead['budget_max']), (3, 5))
        self.assertEqual(lead['notes'], '')
        self.assertEqual(lead['name'], 'Ankur Arora')
        self.assertEqual(lead['area_unit'], 'YD')

    def test_failed_pricing_or_status_rolls_back_main_lead(self):
        for failure in ('INSERT INTO inventory_floor_pricing', 'UPDATE monthly_inventory_entries'):
            self.db.fail = failure
            with self.assertRaises(RuntimeError):
                books.convert(self.db, 10, PAYLOAD, USER, LeadCreate)
            self.assertEqual(self.db.leads, [])
            self.assertEqual(self.db.prices, [])
            self.assertIsNone(self.db.entry['converted_lead_id'])
        self.assertEqual(self.db.rollbacks, 2)

    def test_duplicate_sale_and_rent_follow_web_identity(self):
        existing = dict(PAYLOAD, id=77, address=' c – 5 ', location='ANAND NIKETAN', phone='9899999999', lead_type='builder')
        self.assertTrue(books.duplicates(PAYLOAD, existing))
        self.assertFalse(books.duplicates(PAYLOAD, dict(existing, address='C/5')))
        self.assertFalse(books.duplicates(PAYLOAD, dict(existing, location='Anand Lok')))
        rent = dict(PAYLOAD, lead_type='landlord')
        self.assertFalse(books.duplicates(rent, dict(existing, lead_type='rent')))
        self.assertTrue(books.duplicates(rent, dict(existing, lead_type='rent', phone='+91 98111 11111')))
        for store in (self.db.leads, self.db.telecaller):
            store.append(existing)
            response = self.client.post('/api/monthly-inventory/10/convert', json=PAYLOAD)
            self.assertEqual(response.status_code, 409)
            self.assertIsNone(self.db.entry['converted_lead_id'])
            # rollback replaces containers
            self.db.leads = []

    def test_validation_does_not_create_inventory(self):
        for update in ({'phone': '123'}, {'location': ''}, {'lead_type': 'buyer'}, {'area_size': '-5'},
                       {'floor_pricing': [{'floor': 'FF', 'price': 'NaN'}]}, {'area_unit': 'unknown'},
                       {'builder_id': 99}, {'Property_locationUrl': 'javascript:alert(1)'}):
            response = self.client.post('/api/monthly-inventory/10/convert', json=dict(PAYLOAD, **update))
            self.assertEqual(response.status_code, 422, response.text)
            self.assertFalse(self.db.leads)

    def test_cards_match_address_and_location_and_month_pdf(self):
        self.db.leads = [dict(id=1, address='C5', location='Anand Lok'), dict(id=2, address='C 5', location='ANAND NIKETAN')]
        response = self.client.get('/api/monthly-inventory?month=2026-10&category=residential_sale&search=Owner&page=1')
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual((data['items'][0]['matching_lead_id'], data['items'][0]['pdf_id']), (2, 8))
        self.assertEqual(data['months'], ['2026-10'])
        self.assertFalse(data['has_more'])
        self.assertEqual(self.client.get('/api/monthly-inventory?month=2026-99').status_code, 422)
        self.assertEqual(self.client.get('/api/monthly-inventory?page=0').status_code, 422)

    def test_search_criteria_apply_to_count_and_paginated_results(self):
        response = self.client.get('/api/monthly-inventory', params=dict(
            location='Anand', address='C-5', owner_name='Owner', phone='9811',
            floor='GF', min_area='100', max_area='500', page=2))
        self.assertEqual(response.status_code, 200, response.text)
        queries = [query for query in self.db.queries if query.startswith(('SELECT COUNT(*)', 'SELECT e.*,b.book_month'))]
        self.assertEqual(len(queries), 2)
        for query in queries:
            for column in ['location', 'address', 'owner_name', 'phone', 'floor']:
                self.assertIn(f'e.{column} LIKE %s', query)
            self.assertIn("NULLIF(e.area_size,'') >= %s", query)
            self.assertIn("NULLIF(e.area_size,'') <= %s", query)

    def test_invalid_area_ranges_are_rejected(self):
        for params in [dict(min_area=-1), dict(max_area=-1), dict(min_area=500, max_area=100), dict(min_area='abc')]:
            self.assertEqual(self.client.get('/api/monthly-inventory', params=params).status_code, 422)

    def test_soft_delete_hides_card_blocks_conversion_and_keeps_main_lead(self):
        self.client.post('/api/monthly-inventory/10/convert', json=PAYLOAD)
        for _ in range(2):
            response = self.client.post('/api/monthly-inventory/10/delete')
            self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.db.exclusions), 1)
        self.assertEqual(len(self.db.leads), 1)
        self.assertEqual(self.client.get('/api/monthly-inventory').json()['items'], [])
        self.assertEqual(self.client.post('/api/monthly-inventory/10/convert', json=PAYLOAD).status_code, 404)

    def test_delete_failure_rolls_back_exclusion(self):
        self.db.fail = 'SET e.is_deleted=1'
        with self.assertRaises(RuntimeError):
            books.soft_delete(self.db, 10, USER)
        self.assertEqual(self.db.exclusions, [])
        self.assertFalse(self.db.entry['is_deleted'])

    def test_custom_notes_and_area_unit_saved_separately(self):
        response = self.client.post('/api/monthly-inventory/10/convert', json=dict(PAYLOAD, notes='Call tomorrow', area_unit='SQFT'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.db.leads[0]['notes'], 'Call tomorrow')
        self.assertEqual(self.db.leads[0]['area_size'], '400')
        self.assertEqual(self.db.leads[0]['area_unit'], 'SQFT')

    def test_pdf_stream_preserves_all_chunks_and_is_private(self):
        response = self.client.get('/api/monthly-inventory/pdfs/8')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, self.db.pdf)
        self.assertEqual(response.headers['cache-control'], 'private, no-store')
        self.assertEqual(response.headers['content-type'], 'application/pdf')
        self.assertEqual(int(response.headers['content-length']), len(self.db.pdf))

if __name__ == '__main__':
    unittest.main()
