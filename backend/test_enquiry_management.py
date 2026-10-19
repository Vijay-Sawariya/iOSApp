"""Workflow API tests use a transactional in-memory DB double, never production."""
import copy
import json
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.testclient import TestClient
from pymysql import Connection
import enquiry_management as enquiries

ADMIN = {'id': 7, 'role': 'admin'}
STAFF = {'id': 8, 'role': 'agent'}
PAYLOAD = dict(name='Test Client', phone='+91 98111 11111', lead_type='buyer', location='GK 1',
               property_type='Builder Floor', budget_min='2', budget_max='4', unit='CR', assigned_to=8)


class Database:
    def __init__(self):
        self.row = dict(id=1, assigned_to=8, status='New', main_lead_id=None, full_name='Test',
                        phone='+919811111111', email='', property_interest='GK 1', original_json='{}',
                        current_json='{}', qualification_json=None, spreadsheet_id='meta', worksheet='Sheet1')
        self.leads = []
        self.events = []
        self.actions = []
        self.queries = []
        self.flags = []
        self.telecaller = False
        self.fail = ''
        self.lastrowid = 0
        self.commits = 0
        self.rollbacks = 0
        mysql = Connection(defer_connect=True); mysql.server_status = 0
        self.mysql = mysql.cursor()
        self.result = []

    def cursor(self): return self
    def begin(self): self.snapshot = copy.deepcopy((self.row, self.leads, self.events, self.actions))
    def commit(self): self.commits += 1
    def rollback(self):
        self.rollbacks += 1
        self.row, self.leads, self.events, self.actions = self.snapshot
    def fetchone(self): return self.result[0] if self.result else None
    def fetchall(self): return self.result

    def execute(self, sql, args=None):
        self.mysql.mogrify(sql, args)  # Check real MySQL parameter escaping and placeholder counts.
        self.queries.append((sql, args)); self.result = []
        if self.fail and self.fail in sql: raise RuntimeError('injected write failure')
        if 'FROM user_mobile_feature_flags' in sql: self.result = copy.deepcopy(self.flags)
        elif sql.startswith('SELECT GET_LOCK'): self.result = [{'acquired': 1}]
        elif sql.startswith('SELECT e.* FROM sheet_enquiries'):
            if args[0] == 1 and (len(args) == 1 or args[1] == self.row['assigned_to']):
                self.result = [copy.deepcopy(self.row)]
        elif sql.startswith('SELECT id,username,full_name FROM users'):
            self.result = [{'id': 8, 'username': 'agent', 'full_name': 'Agent'}]
        elif sql.startswith('SELECT id FROM leads'):
            self.result = [{'id': r['id']} for r in self.leads if enquiries.phone_key(r['phone']) == enquiries.phone_key(args[0])]
        elif sql.startswith('SELECT id FROM telecaller_leads'):
            self.result = [{'id': 99}] if self.telecaller else []
        elif sql.startswith('SELECT * FROM leads WHERE id='):
            self.result = [copy.deepcopy(r) for r in self.leads if r['id'] == args[0]]
        elif sql.startswith('SELECT * FROM leads WHERE'):
            self.result = copy.deepcopy(self.leads)
        elif sql.startswith('SELECT user_id FROM lead_assignments'):
            self.result = [{'user_id': 12}]
        elif sql.startswith('INSERT INTO leads'):
            fields = sql.split('(', 1)[1].split(')', 1)[0].replace('`', '').split(',')
            data = dict(zip(fields, args)); data['id'] = 42; self.leads.append(data); self.lastrowid = 42
        elif sql.startswith('INSERT INTO actions'):
            self.actions.append(tuple(args)); self.lastrowid = 50
        elif sql.startswith('INSERT INTO sheet_enquiry_activities'):
            self.events.append((args[2], json.loads(args[3])))
        elif sql.startswith('UPDATE sheet_enquiries SET assigned_to=%s,status='):
            self.row.update(assigned_to=args[0], main_lead_id=args[1], status='Qualified')
        elif sql.startswith('UPDATE sheet_enquiries SET assigned_to='):
            self.row['assigned_to'] = args[0]
        elif sql.startswith('UPDATE sheet_enquiries SET status='):
            self.row['status'] = args[0]
        elif sql.startswith('UPDATE sheet_enquiries SET qualification_json='):
            self.row['qualification_json'] = args[0]
        elif sql.startswith('SELECT COUNT(*) total,'):
            self.result = [dict(total=1, new_count=1, assigned=1, unassigned=0, due=0, qualified=0, converted=0)]
        elif sql.startswith('SELECT COUNT(*) total FROM'):
            self.result = [{'total': 1}]
        elif sql.startswith('SELECT e.*,u.full_name employee'):
            self.result = [dict(self.row, employee='Agent', possible_duplicate=0)]


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.db = Database(); self.user = dict(ADMIN)
        @contextmanager
        def get_db(): yield self.db
        app = FastAPI(); router = APIRouter()
        def get_user(): return self.user
        def columns(cursor, table): return set(PAYLOAD) | {'email', 'lead_status', 'source_type', 'created_by', 'created_at', 'assigned_to', 'meta_enquiry_text'}
        enquiries.register_routes(router, get_db, get_user, columns, lambda c, t: t != getattr(self.db, 'missing_table', None), lambda c: 'is_active=1')
        app.include_router(router); self.client = TestClient(app)
    def post(self, action, payload=None):
        return self.client.post('/mobile/enquiry-management/1/'+action, json=payload or {})

    def test_list_filters_are_parameterized_and_scoped(self):
        self.user = dict(STAFF)
        response = self.client.get('/mobile/enquiry-management', params=dict(q="a' OR 1=1", status='New', due='true', duplicates='true', sort='name'))
        self.assertEqual(response.status_code, 200)
        query, args = next((q, a) for q, a in self.db.queries if q.startswith('SELECT e.*,u.full_name employee'))
        self.assertIn('e.assigned_to=%s', query); self.assertNotIn("a' OR", query)
        self.assertIn('ORDER BY e.full_name ASC,e.id DESC', query)
        self.assertEqual(args[0], 8)
        self.assertEqual(response.json()['total'], 1)

    def test_feature_flag_blocks_direct_api_access(self):
        self.db.flags = [{'feature_key': 'enquiry_management', 'is_enabled': 0}]
        self.assertEqual(self.post('mark_invalid').status_code, 403)
        self.assertEqual(self.db.row['status'], 'New')

    def test_staff_cannot_read_or_mutate_someone_elses_enquiry(self):
        self.user = {'id': 12, 'role': 'agent'}
        self.assertEqual(self.post('mark_invalid').status_code, 404)
        self.assertEqual(self.client.get('/mobile/enquiry-management/1/leads?q=Test').status_code, 404)

    def test_only_managers_assign_and_admin_or_senior_convert(self):
        self.user = dict(STAFF)
        self.assertEqual(self.post('assign', {'assigned_to': 8}).status_code, 403)
        self.assertEqual(self.post('qualify', PAYLOAD).status_code, 403)
        self.user = {'id': 8, 'role': 'manager'}
        self.assertEqual(self.post('qualify', PAYLOAD).status_code, 403)
        self.user = {'id': 8, 'role': 'sr agent'}
        self.assertEqual(self.post('qualify', PAYLOAD).status_code, 200)

    def test_conversion_is_atomic_and_retry_does_not_create_second_lead(self):
        first = self.post('qualify', PAYLOAD)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()['lead_id'], 42)
        self.assertEqual(self.db.row['status'], 'Qualified')
        self.assertIn('Original questions and answers:', self.db.leads[0]['meta_enquiry_text'])
        self.assertEqual(self.post('qualify', PAYLOAD).json()['lead_id'], 42)
        self.assertEqual(len(self.db.leads), 1)
        self.assertTrue(any('RELEASE_LOCK' in q for q, a in self.db.queries))
        self.assertEqual(self.post('mark_invalid').status_code, 409)

    def test_mid_conversion_failure_rolls_back_every_write(self):
        self.db.fail = 'INSERT INTO lead_assignments'
        with self.assertRaises(RuntimeError): self.post('qualify', PAYLOAD)
        self.assertEqual(self.db.leads, [])
        self.assertIsNone(self.db.row['main_lead_id'])
        self.assertEqual(self.db.events, [])
        self.assertTrue(any('RELEASE_LOCK' in q for q, a in self.db.queries))

    def test_existing_and_telecaller_duplicates_block_conversion(self):
        self.db.leads = [dict(id=21, phone='9811111111')]
        self.assertEqual(self.post('qualify', PAYLOAD).status_code, 409)
        self.db.leads = []; self.db.telecaller = True
        self.assertEqual(self.post('qualify', PAYLOAD).status_code, 409)
        self.assertIsNone(self.db.row['main_lead_id'])

    def test_existing_lead_link_keeps_ownership_and_is_idempotent(self):
        self.db.leads = [dict(id=21, phone='9811111111', assigned_to=12)]
        body = dict(lead_id=21, assigned_to=8)
        self.assertEqual(self.post('link_existing', body).status_code, 200)
        self.assertEqual(self.db.leads[0]['assigned_to'], 12)
        self.assertEqual(self.post('link_existing', body).status_code, 200)
        self.assertEqual(self.post('link_existing', dict(lead_id=22, assigned_to=8)).status_code, 409)

    def test_existing_lead_link_checks_modify_permission(self):
        self.user = dict(STAFF)
        self.db.leads = [dict(id=21, phone='9811111111', assigned_to=12, created_by=12)]
        self.assertEqual(self.post('link_existing', dict(lead_id=21, assigned_to=8)).status_code, 403)

    def test_followup_requires_assignment_future_ist_and_outcome(self):
        due = (datetime.now(ZoneInfo('Asia/Kolkata')) + timedelta(days=1)).strftime('%Y-%m-%dT%H:%M')
        body = dict(due_at=due, outcome='Connected', remarks='Call tomorrow')
        self.db.row['assigned_to'] = None
        self.assertEqual(self.post('followup', body).status_code, 422)
        self.db.row['assigned_to'] = 8
        self.assertEqual(self.post('followup', dict(body, due_at='2020-01-01T12:00')).status_code, 422)
        self.assertEqual(self.post('followup', dict(body, outcome='unknown')).status_code, 422)
        self.assertEqual(self.post('followup', body).status_code, 200)
        self.assertEqual(len(self.db.actions), 1)
        self.assertEqual(self.db.events[-1][0], 'followup')

    def test_invalid_can_be_restored(self):
        self.assertEqual(self.post('restore_invalid').status_code, 409)
        self.assertEqual(self.post('mark_invalid').status_code, 200)
        self.assertEqual(self.db.row['status'], 'Invalid')
        self.assertEqual(self.post('restore_invalid').status_code, 200)
        self.assertEqual(self.db.row['status'], 'New')

    def test_qualification_validation(self):
        for change in [dict(budget_min='nan'), dict(budget_max='1'), dict(location=''), dict(phone='123'), dict(max_possession_wait_months='1.5'), dict(lead_type='seller')]:
            with self.subTest(change=change):
                self.assertEqual(self.post('qualify', dict(PAYLOAD, **change)).status_code, 422)
                self.assertIsNone(self.db.row['main_lead_id'])

    def test_search_filters_inaccessible_leads_and_escapes_wildcards(self):
        self.user = dict(STAFF)
        self.db.leads = [dict(id=21, name='Visible', phone='9811111111', created_by=8), dict(id=22, name='Hidden', phone='9822222222', created_by=12)]
        result = self.client.get('/mobile/enquiry-management/1/leads', params={'q': 'a_%'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual([r['id'] for r in result.json()], [21])
        self.assertTrue(any(a == ['%a!_!%%'] for q, a in self.db.queries if q.startswith('SELECT * FROM leads WHERE')))

    def test_missing_registry_returns_setup_message(self):
        self.db.missing_table = 'sheet_enquiries'
        response = self.client.get('/mobile/enquiry-management')
        self.assertEqual(response.status_code, 503)
        self.assertIn('migration', response.json()['detail'])

    def test_assignment_moves_only_pending_followups(self):
        self.db.row['assigned_to'] = 7
        self.assertEqual(self.post('assign', {'assigned_to': 8}).status_code, 200)
        self.assertEqual(self.db.row['assigned_to'], 8)
        query, args = next((q, a) for q, a in self.db.queries if q.startswith('UPDATE actions'))
        self.assertIn("status IN ('Pending','Missed')", query)
        self.assertEqual(args, (8, 8, 1))
        self.assertEqual(self.db.events[-1], ('assignment', {'from': 7, 'to': 8}))

    def test_time_serialization(self):
        self.assertEqual(enquiries.wire({'due_time': timedelta(hours=10, minutes=30)})['due_time'], '10:30:00')


if __name__ == '__main__': unittest.main()
