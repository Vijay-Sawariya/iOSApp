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
        self.card_followups = []
        self.repeat_candidates = []
        self.repeat_owners = []
        self.conversations = []
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
        elif sql.startswith('SELECT id,phone FROM sheet_enquiries WHERE assigned_to IS NULL'):
            self.result = self.repeat_candidates
        elif sql.startswith('SELECT (SELECT la.user_id'):
            self.result = [{'assigned_to': owner} for owner in self.repeat_owners]
        elif sql.startswith('SELECT enquiry_id,details,created_at FROM sheet_enquiry_activities'):
            self.result = self.conversations
        elif sql.startswith('SELECT id FROM leads'):
            self.result = [{'id': r['id']} for r in self.leads if enquiries.phone_key(r['phone']) == enquiries.phone_key(args[0])]
        elif sql.startswith('SELECT id FROM telecaller_leads'):
            self.result = [{'id': 99}] if self.telecaller else []
        elif sql.startswith('SELECT * FROM leads WHERE id='):
            self.result = [copy.deepcopy(r) for r in self.leads if r['id'] == args[0]]
        elif sql.startswith('SELECT * FROM leads WHERE') or sql.startswith('SELECT leads.*'):
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
        elif sql.startswith('SELECT id,entity_id,due_date,due_time,status,description FROM actions'):
            self.result = self.card_followups
        elif sql.startswith('SELECT e.id,e.full_name,e.phone,e.property_interest'):
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
        query, args = next((q, a) for q, a in self.db.queries if q.startswith('SELECT e.id,e.full_name,e.phone,e.property_interest'))
        self.assertIn('e.status,e.assigned_to,e.main_lead_id', query)
        self.assertIn('e.assigned_to=%s', query); self.assertNotIn("a' OR", query)
        self.assertIn('ORDER BY e.full_name ASC,e.id DESC', query)
        self.assertEqual(args[0], 8)
        self.assertEqual(response.json()['total'], 1)

    def test_feature_flag_blocks_direct_api_access(self):
        self.db.flags = [{'feature_key': 'enquiry_management', 'is_enabled': 0}]
        self.assertEqual(self.post('mark_invalid').status_code, 403)
        self.assertEqual(self.db.row['status'], 'New')

    def test_feature_toggle_controls_list_and_detail_access(self):
        self.db.flags = [{'feature_key': 'enquiry_management', 'is_enabled': 0}]
        for path in ('/mobile/enquiry-management', '/mobile/enquiry-management/1'):
            self.assertEqual(self.client.get(path).status_code, 403)
        self.db.flags = [{'feature_key': 'enquiry_management', 'is_enabled': 1},
                         {'feature_key': '__default__', 'is_enabled': 0}]
        self.assertEqual(self.client.get('/mobile/enquiry-management').status_code, 200)

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

    def test_repeat_assignment_only_for_unambiguous_active_owner(self):
        self.db.repeat_candidates = [{'id': 1, 'phone': '+919811111111'}]
        self.db.row['assigned_to'] = None
        self.db.repeat_owners = [8, 8, None]
        response = self.client.get('/mobile/enquiry-management')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.db.row['assigned_to'], 8)
        self.assertEqual(self.db.events[0][1]['reason'], 'repeat_phone_match')
        self.db.row['assigned_to'] = None
        self.db.repeat_owners = [8, 12]
        self.client.get('/mobile/enquiry-management')
        self.assertIsNone(self.db.row['assigned_to'])

    def test_last_conversation_on_card_without_reminder(self):
        self.db.conversations = [{'enquiry_id': 1, 'details': json.dumps({'outcome': 'Connected', 'remarks': 'Shared details'}), 'created_at': '2026-10-21 12:00:00'}]
        result = self.client.get('/mobile/enquiry-management').json()
        self.assertEqual(result['items'][0]['last_conversation']['remarks'], 'Shared details')
        self.assertEqual(result['items'][0]['followup_count'], 0)

    def test_optional_date_saves_conversation_and_assignment_atomically(self):
        self.db.row['assigned_to'] = None
        response = self.post('followup', {'assigned_to': 8, 'outcome': 'Connected', 'remarks': 'Requirements discussed'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.db.row['assigned_to'], 8)
        self.assertEqual(self.db.actions, [])
        self.assertEqual(self.db.events[-1][0], 'conversation')
        self.assertIsNone(self.db.events[-1][1]['due_at'])
        self.assertEqual(self.db.events[-1][1]['remarks'], 'Requirements discussed')

    def test_failed_followup_rolls_back_inline_assignment(self):
        self.db.row['assigned_to'] = None
        self.db.fail = 'INSERT INTO actions'
        with self.assertRaises(RuntimeError):
            self.post('followup', {'assigned_to': 8, 'outcome': 'Busy', 'due_at': '2099-01-01T12:00'})
        self.assertIsNone(self.db.row['assigned_to'])
        self.assertEqual(self.db.events, [])

    def test_lead_search_returns_current_assignee(self):
        self.db.leads = [dict(id=21, name='Existing', phone='9811111111', current_owner=8)]
        result = self.client.get('/mobile/enquiry-management/1/leads?q=Existing')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()[0]['assigned_to'], 8)

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
        self.assertTrue(any(a == ['%a!_!%%'] for q, a in self.db.queries if q.startswith('SELECT leads.*')))

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

    def test_list_aggregates_due_once_and_omits_source_snapshots(self):
        self.db.row['original_json'] = json.dumps({'questions': ['Time?'], 'answers': ['Morning'], 'raw': ['large source row']})
        self.db.row['current_json'] = json.dumps({'large': 'updated snapshot'})
        response = self.client.get('/mobile/enquiry-management')
        self.assertEqual(response.status_code, 200)
        stats_query = next(q for q, a in self.db.queries if q.startswith('SELECT COUNT(*) total,'))
        self.assertIn('SELECT DISTINCT entity_id FROM actions', stats_query)
        self.assertNotIn('a.entity_id=e.id', stats_query)
        self.assertFalse(any(q.startswith('SELECT COUNT(*) total FROM') for q, a in self.db.queries))
        item = response.json()['items'][0]
        self.assertEqual(item['original'], {'questions': ['Time?'], 'answers': ['Morning']})
        self.assertNotIn('current', item)
        self.assertNotIn('qualification', item)

    def test_card_followups_are_batched_and_keep_description_and_time(self):
        description = "Outcome: Busy\nHe didn't answer my call so i have drop the whatsapp message"
        self.db.card_followups = [
            dict(id=51, entity_id=1, status='Pending', due_date='2026-10-20', due_time=timedelta(hours=13, minutes=35), description=description),
            dict(id=50, entity_id=1, status='Completed', due_date='2026-10-19', due_time=None, description='Previous call'),
        ]
        response = self.client.get('/mobile/enquiry-management')
        self.assertEqual(response.status_code, 200)
        card = response.json()['items'][0]
        self.assertEqual(card['followup_count'], 2)
        self.assertEqual(card['next_followup']['description'], description)
        self.assertEqual(card['next_followup']['due_time'], '13:35:00')
        queries = [(q, a) for q, a in self.db.queries if q.startswith('SELECT id,entity_id,due_date,due_time,status,description FROM actions')]
        self.assertEqual(len(queries), 1)
        self.assertEqual(queries[0][1], [1])
        self.assertIn("CASE WHEN status IN ('Pending','Missed') THEN 0 ELSE 1 END", queries[0][0])

    def test_time_serialization(self):
        self.assertEqual(enquiries.wire({'due_time': timedelta(hours=10, minutes=30)})['due_time'], '10:30:00')


if __name__ == '__main__': unittest.main()
