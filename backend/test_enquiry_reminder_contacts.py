"""Exercise the production reminder reader without loading external startup integrations."""
import ast
import copy
import unittest
from pathlib import Path
from contextlib import contextmanager

class Database:
    def __init__(self):
        self.actions = [dict(id=5, entity_type='sheet_enquiry', entity_id=19, lead_id=None, title='Enquiry #19 follow-up', due_date='2099-01-01', due_time='12:00:00', action_type='Call', description='Call again')]
        self.enquiries = [dict(id=19, full_name='Vivek Jain', phone='9811111111', assigned_to=8)]
    def cursor(self): return self
    def commit(self): pass
    def execute(self, sql, args):
        self.result = self.enquiries if 'FROM sheet_enquiries' in sql else self.actions
    def fetchall(self): return copy.deepcopy(self.result)

def handler(db):
    @contextmanager
    def get_db(): yield db
    node = next(n for n in ast.parse(Path(__file__).with_name('server.py').read_text()).body if isinstance(n, ast.FunctionDef) and n.name == 'get_reminders')
    node.decorator_list = []
    scope = dict(Depends=lambda fn: None, get_current_user=lambda: None, get_db=get_db,
                 ensure_action_assignment_column=lambda c: None, assignment_contact_map=lambda c, ids: {},
                 should_mask_data=lambda *args: False, mask_phone=lambda x: 'masked')
    exec(compile(ast.Module(body=[node],type_ignores=[]),'server.py','exec'),scope)
    return scope['get_reminders']

class EnquiryReminderTests(unittest.TestCase):
    def test_assigned_enquirer_name_contact_and_legacy_title(self):
        rows = handler(Database())(current_user={'id':8,'role':'agent'})
        self.assertEqual(rows[0]['title'],'Enquiry Vivek Jain #19 follow-up')
        self.assertEqual(rows[0]['lead_phone'],'9811111111')
        self.assertTrue(rows[0]['can_view_sensitive'])
    def test_former_owner_cannot_see_enquiry_contact(self):
        row = handler(Database())(current_user={'id':7,'role':'agent'})[0]
        self.assertIsNone(row['lead_phone'])
        self.assertIsNone(row['lead_name'])
        self.assertFalse(row['can_view_sensitive'])
    def test_custom_title_is_preserved(self):
        db=Database(); db.actions[0]['title']='Specific instructions'
        self.assertEqual(handler(db)(current_user={'id':8,'role':'agent'})[0]['title'],'Specific instructions')
