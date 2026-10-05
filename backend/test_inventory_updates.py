import ast
import copy
import json
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import Mock
import inventory_updates as inventory


class HTTPError(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail
        super().__init__(detail)


def handlers(**overrides):
    tree = ast.parse(Path(__file__).with_name('server.py').read_text())
    names = {'inventory_permission', 'save_inventory_update', 'get_inbox_summary', 'get_lead', 'update_lead', 'delete_lead'}
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    for node in nodes:
        node.decorator_list = []
    scope = dict(Depends=lambda _: None, get_current_user=lambda: None, HTTPException=HTTPError,
                 inventory_updates=inventory, json=json)
    scope.update(overrides)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'server.py', 'exec'), scope)
    return scope


def snapshot():
    return dict(floor='Ground,First', lead_status='Available', unit='Cr', budget_min='1.00', budget_max='2.00',
                prices=[dict(floor_label='Ground', floor_amount='1.00'), dict(floor_label='First', floor_amount='2.00')])


def payload():
    return dict(inventory_version=inventory.version(snapshot()), call_notes='Verified by phone', entire_sold=False,
                floors=[dict(label='Ground', price='1.00', sold=False), dict(label='First', price='2.00', sold=False)])


class PlanTests(unittest.TestCase):
    def test_multi_floor_price_and_sale(self):
        data = payload(); data['floors'][0]['sold'] = True; data['floors'][1]['price'] = '3.50'
        self.assertEqual(inventory.plan(snapshot(), data), [('sold_floor', 'Ground', None), ('price_floor', 'First', '3.50')])

    def test_reject_invalid_prices(self):
        for raw in ('', '0', '-1', 'NaN', 'Infinity', '1e3', '1.001', '10000000000000', True):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                data = payload(); data['floors'][0]['price'] = raw
                inventory.plan(snapshot(), data)

    def test_duplicate_missing_unknown_floors_and_notes(self):
        for mutation in (lambda d: d['floors'].pop(), lambda d: d['floors'][1].update(label='Ground'),
                         lambda d: d['floors'][1].update(label='Roof'), lambda d: d.update(call_notes=' '),
                         lambda d: d.update(name='Unauthorized general edit')):
            with self.assertRaises(ValueError):
                data = payload(); mutation(data); inventory.plan(snapshot(), data)

    def test_entire_sold_ignores_disabled_prices(self):
        data = payload(); data.update(entire_sold=True); data['floors'][0]['price'] = 'bad'
        self.assertEqual(inventory.plan(snapshot(), data), [('sold_all', '', None)])

    def test_property_price_without_floors(self):
        before = snapshot(); before.update(floor='', prices=[])
        data = payload(); data.update(floors=[], property_price='5.25')
        self.assertEqual(inventory.plan(before, data), [('price_all', '', '5.25')])

    def test_versions_change_with_price_floor_and_status(self):
        before = snapshot()
        for key, value in [('floor', 'Ground'), ('lead_status', 'Sold'), ('unit', 'Lakh'), ('budget_max', '3.00')]:
            changed = dict(before, **{key: value})
            self.assertNotEqual(inventory.version(before), inventory.version(changed))


class PermissionTests(unittest.TestCase):
    def permission(self, role='agent', status=None, owner=False, builder=False):
        cursor = Mock(); cursor.fetchone.return_value = {'status': status} if status else None
        scope = handlers(current_assignee_map=lambda *_: {}, should_mask_data=lambda *_: not owner)
        return scope['inventory_permission'](cursor, {'id': 1, 'created_by': 2, 'lead_type': 'builder' if builder else 'seller'}, {'id': 3, 'role': role})

    def test_only_approved_request_grants_inventory_access(self):
        self.assertTrue(self.permission(status='approved'))
        for status in (None, 'pending', 'declined', 'revoked'):
            with self.assertRaises(HTTPError) as caught: self.permission(status=status)
            self.assertEqual(caught.exception.status_code, 403)

    def test_owner_and_senior_builder_status_permission(self):
        self.assertTrue(self.permission(owner=True))
        self.assertFalse(self.permission(role='sr agent', builder=True))
        with self.assertRaises(HTTPError): self.permission(role='sr agent')

    def test_contact_approval_does_not_grant_full_lead(self):
        cursor = Mock(); cursor.fetchone.return_value = {'id': 1}
        conn = Mock(); conn.cursor.return_value = cursor
        @contextmanager
        def db(): yield conn
        scope = handlers(get_db=db, ensure_collaboration_tables=lambda _: None, can_access_collaboration_lead=lambda *_: False)
        with self.assertRaises(HTTPError) as caught: scope['get_lead'](1, {'id': 3})
        self.assertEqual(caught.exception.status_code, 403)

    def test_contact_approval_cannot_edit_or_delete_general_lead(self):
        cursor = Mock(); cursor.fetchone.return_value = {'created_by': 2}
        conn = Mock(); conn.cursor.return_value = cursor
        @contextmanager
        def db(): yield conn
        scope = handlers(get_db=db, ensure_collaboration_tables=lambda _: None,
                         current_assignee_map=lambda *_: {}, should_mask_data=lambda *_: True,
                         get_detail_access_map=lambda *_: {1: 'approved'})
        for name, arguments in [('update_lead', (1, {'name': 'Changed'}, {'id': 3, 'role': 'agent'})),
                                ('delete_lead', (1, {'id': 3, 'role': 'agent'}))]:
            with self.assertRaises(HTTPError) as caught: scope[name](*arguments)
            self.assertEqual(caught.exception.status_code, 403)
        conn.commit.assert_not_called()
        self.assertTrue(all(call.args[0].startswith('SELECT') for call in cursor.execute.call_args_list))


class TransactionTests(unittest.TestCase):
    def setup_handler(self, before=None, full=True, fail=False):
        before = before or snapshot()
        cursor = Mock(); cursor.lastrowid = 7
        cursor.fetchone.return_value = {'low': None, 'high': None}
        cursor.fetchall.return_value = [{'id': 9}, {'id': 3}]
        if fail:
            def execute(sql, *args):
                if 'INSERT INTO collaboration_notifications' in sql: raise RuntimeError('notification write failed')
            cursor.execute.side_effect = execute
        conn = Mock(); conn.cursor.return_value = cursor
        @contextmanager
        def db(): yield conn
        scope = handlers(get_db=db, ensure_collaboration_tables=lambda _: None, ensure_inventory_reports=lambda _: None,
                         lock_inventory=lambda *_: dict(before, id=1, created_by=9), inventory_snapshot=lambda *_: copy.deepcopy(before))
        scope['inventory_permission'] = lambda *_: full
        return scope['save_inventory_update'], conn, cursor

    def test_stale_submission_rolls_back_before_mutation(self):
        handler, conn, cursor = self.setup_handler()
        data = payload(); data['inventory_version'] = 'old'
        with self.assertRaises(HTTPError) as caught: handler(1, data, {'id': 3})
        self.assertEqual(caught.exception.status_code, 409)
        conn.rollback.assert_called_once(); cursor.execute.assert_not_called()

    def test_all_floors_sold_removes_prices_and_range(self):
        handler, conn, cursor = self.setup_handler()
        data = payload(); data['entire_sold'] = True
        handler(1, data, {'id': 3})
        cursor.execute.assert_any_call('UPDATE leads SET floor=%s,lead_status=%s,budget_min=%s,budget_max=%s WHERE id=%s', ('','Sold',None,None,1))
        self.assertEqual(conn.commit.call_count, 2)  # schema setup, then one atomic mutation commit
        conn.rollback.assert_not_called()

    def test_last_floor_sold_marks_property_sold(self):
        before = snapshot(); before.update(floor='Ground', prices=before['prices'][:1])
        handler, conn, cursor = self.setup_handler(before)
        data = payload(); data.update(inventory_version=inventory.version(before), floors=[dict(label='Ground', sold=True)])
        handler(1, data, {'id': 3})
        cursor.execute.assert_any_call('UPDATE leads SET floor=%s,lead_status=%s,budget_min=%s,budget_max=%s WHERE id=%s', ('','Sold',None,None,1))

    def test_remaining_range_and_original_values_are_saved(self):
        handler, conn, cursor = self.setup_handler()
        cursor.fetchone.return_value = {'low': '2.00', 'high': '2.00'}
        data = payload(); data['floors'][0]['sold'] = True
        handler(1, data, {'id': 3})
        cursor.execute.assert_any_call('UPDATE leads SET floor=%s,lead_status=%s,budget_min=%s,budget_max=%s WHERE id=%s', ('First','Available','2.00','2.00',1))
        report = next(call.args[1] for call in cursor.execute.call_args_list if 'INSERT INTO inventory_change_reports' in call.args[0])
        self.assertEqual(report[:6], (1, 3, 'sold_floor', 'Ground', None, 'Verified by phone'))
        self.assertEqual(json.loads(report[6]), snapshot())
        notices = [call.args[1] for call in cursor.execute.call_args_list if 'INSERT INTO collaboration_notifications' in call.args[0]]
        self.assertEqual(len(notices), 1)
        self.assertEqual(notices[0][:3], (9, 1, 7))

    def test_notification_failure_rolls_back_updates_and_history(self):
        handler, conn, cursor = self.setup_handler(fail=True)
        data = payload(); data['entire_sold'] = True
        with self.assertRaises(RuntimeError): handler(1, data, {'id': 3})
        conn.rollback.assert_called_once(); self.assertEqual(conn.commit.call_count, 1)

    def test_senior_agent_cannot_sneak_price_change(self):
        handler, conn, cursor = self.setup_handler(full=False)
        data = payload(); data['floors'][0]['price'] = '9'
        with self.assertRaises(HTTPError) as caught: handler(1, data, {'id': 3})
        self.assertEqual(caught.exception.status_code, 403)
        conn.rollback.assert_called_once(); cursor.execute.assert_not_called()

    def test_summary_counts_pending_independent_of_read_and_limit(self):
        cursor = Mock(); cursor.fetchone.return_value = {'pending_requests': 3, 'unread_updates': 2}
        conn = Mock(); conn.cursor.return_value = cursor
        @contextmanager
        def db(): yield conn
        result = handlers(get_db=db, ensure_collaboration_tables=lambda _: None)['get_inbox_summary']({'id': 3})
        self.assertEqual(result, {'pending_requests': 3, 'unread_updates': 2})
        query = cursor.execute.call_args.args[0]
        pending = query.split('pending_requests')[0]
        self.assertNotIn('is_read', pending)
        self.assertNotIn('LIMIT', query)


if __name__ == '__main__': unittest.main()
