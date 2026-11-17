import unittest
from contextlib import contextmanager
from enquiry_push import dispatch

class PushDB:
    def __init__(self):
        self.device={'token':'ExponentPushToken[test]','user_id':7,'last_enquiry_id':10,'role':'agent'}
        self.rows=[{'id':11,'assigned_to':7,'original_json':'{}','spreadsheet_id':'magicbricks','worksheet':'Magic Brick Enquiries'}]
        self.flags=[]; self.result=[]; self.queries=[];self.commits=0;self.rollbacks=0
    def cursor(self):return self
    def execute(self,q,args=()):
        self.queries.append((q,args));self.result=[]
        if q.startswith('SELECT GET_LOCK'):self.result=[{'acquired':1}]
        elif q.startswith('SELECT d.token'):self.result=[self.device.copy()]
        elif q.startswith('SELECT COALESCE(MAX'):self.result=[{'id':11}]
        elif q.startswith('SHOW TABLES'):self.result=[{'table':'user_mobile_feature_flags'}]
        elif 'SELECT feature_key' in q:self.result=self.flags
        elif q.startswith('SELECT e.*'):
            self.result=[r for r in self.rows if r['id']>args[-2] and not r.get('is_deleted') and r['assigned_to']==args[0]]
        elif q.startswith('UPDATE mobile_enquiry_push_devices'):self.device['last_enquiry_id']=args[0]
        elif q.startswith('DELETE FROM mobile_enquiry_push_devices'):self.device['removed']=True
    def fetchone(self):return self.result[0] if self.result else None
    def fetchall(self):return self.result
    def commit(self):self.commits+=1
    def rollback(self):self.rollbacks+=1

class PushTests(unittest.TestCase):
    def setUp(self):
        self.db=PushDB();self.sent=[]
        @contextmanager
        def get_db():yield self.db
        self.get_db=get_db
    def sender(self,messages):
        self.sent.extend(messages);return [{'status':'ok'} for m in messages]
    def test_dispatch_scoped_background_push_and_no_duplicate(self):
        dispatch(self.get_db,self.sender)
        self.assertEqual(self.sent[0]['data'],{'type':'enquiry','enquiryId':11})
        self.assertIn('Magicbricks',self.sent[0]['title'])
        self.assertEqual(self.db.device['last_enquiry_id'],11)
        dispatch(self.get_db,self.sender)
        self.assertEqual(len(self.sent),1)
    def test_denied_account_and_deleted_or_other_owner_receive_nothing(self):
        self.db.flags=[{'feature_key':'enquiry_management','is_enabled':0}]
        dispatch(self.get_db,self.sender);self.assertFalse(self.sent)
        self.db.flags=[];self.db.rows[0]['is_deleted']=1
        dispatch(self.get_db,self.sender);self.assertFalse(self.sent)
    def test_send_failure_does_not_consume_cursor(self):
        def fail(messages):raise RuntimeError('network')
        dispatch(self.get_db,fail)
        self.assertEqual(self.db.device['last_enquiry_id'],10)
        dispatch(self.get_db,self.sender);self.assertEqual(len(self.sent),1)
    def test_unregistered_device_is_removed(self):
        dispatch(self.get_db,lambda messages:[{'status':'error','details':{'error':'DeviceNotRegistered'}}])
        self.assertTrue(self.db.device['removed'])

if __name__=='__main__':unittest.main()
