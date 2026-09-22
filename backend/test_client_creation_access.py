"""Check client creation permissions before the handler reaches the database."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest


class HTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        super().__init__(detail)


class DatabaseReached(Exception):
    pass


def create_handler():
    tree = ast.parse(Path(__file__).with_name('server.py').read_text())
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'create_lead')
    node.decorator_list = []
    node.args.defaults = []

    def get_db():
        raise DatabaseReached()

    scope = dict(LeadCreate=SimpleNamespace, HTTPException=HTTPException, get_db=get_db)
    exec(compile(ast.Module(body=[node], type_ignores=[]), 'server.py', 'exec'), scope)
    return scope['create_lead']


class ClientCreationAccessTests(unittest.TestCase):
    def test_non_admin_clients_require_cold_calling_context(self):
        handler = create_handler()
        for role in ['user', 'manager', 'caller', 'tele caller', 'telecaller']:
            for lead_type in ['buyer', 'tenant']:
                for context in [None, 'client', 'inventory', 'cold_calling']:
                    with self.subTest(role=role, lead_type=lead_type, context=context):
                        lead = SimpleNamespace(lead_type=lead_type, creation_context=context,
                                               lead_source='Cold_Calling')
                        if context == 'cold_calling':
                            with self.assertRaises(DatabaseReached):
                                handler(lead, {'role': role})
                        else:
                            with self.assertRaises(HTTPException) as error:
                                handler(lead, {'role': role})
                            self.assertEqual(error.exception.status_code, 403)

    def test_admin_and_inventory_creation_remain_allowed(self):
        handler = create_handler()
        for role in ['admin', ' Admin ', 'caller', 'user']:
            types = ['seller', 'builder', 'landlord', 'agent']
            if role.strip().lower() == 'admin':
                types += ['buyer', 'tenant']
            for lead_type in types:
                with self.subTest(role=role, lead_type=lead_type):
                    with self.assertRaises(DatabaseReached):
                        handler(SimpleNamespace(lead_type=lead_type, creation_context=None), {'role': role})


if __name__ == '__main__':
    unittest.main()
