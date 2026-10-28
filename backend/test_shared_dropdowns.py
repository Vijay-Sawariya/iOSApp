"""Exercise the actual route without importing server startup or external services."""
import ast
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock


class DatabaseError(Exception):
    pass


class HttpError(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        self.detail = detail


class DropdownRouteTest(unittest.TestCase):
    def setUp(self):
        module = ast.parse(Path(__file__).with_name('server.py').read_text())
        route = next(node for node in module.body if isinstance(node, ast.FunctionDef) and node.name == 'get_dropdown_options')
        route.decorator_list = []
        self.cursor = MagicMock()
        self.cursor.fetchall.return_value = [
            {'category': 'bhk', 'value': 'Kothi', 'label': 'Kothi'},
            {'category': 'amenities', 'value': 'private_garden', 'label': 'Private Garden'},
        ]
        connection = MagicMock()
        connection.cursor.return_value.__enter__.return_value = self.cursor
        @contextmanager
        def get_db():
            yield connection
        namespace = {'get_db': get_db, 'Response': object, 'HTTPException': HttpError,
                     'pymysql': SimpleNamespace(MySQLError=DatabaseError), 'logging': MagicMock()}
        exec(compile(ast.Module(body=[route], type_ignores=[]), '<dropdown-route>', 'exec'), namespace)
        self.route = namespace['get_dropdown_options']

    def test_shared_rows_and_all_six_groups(self):
        response = SimpleNamespace(headers={})
        result = self.route(response)
        self.assertEqual(result['schema_version'], 1)
        self.assertEqual(len(result['options']), 6)
        self.assertEqual(result['options']['bhk'][0]['value'], 'Kothi')
        self.assertEqual(result['options']['amenities'][0]['label'], 'Private Garden')
        query = self.cursor.execute.call_args.args[0]
        self.assertIn('global_dropdown_options', query)
        self.assertIn('WHERE is_active=1', query)
        self.assertIn('ORDER BY category,sort_order,id', query)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_database_failure_is_explicit(self):
        self.cursor.execute.side_effect = DatabaseError('missing table')
        with self.assertRaises(HttpError) as error:
            self.route(SimpleNamespace(headers={}))
        self.assertEqual(error.exception.status_code, 503)


if __name__ == '__main__':
    unittest.main()
