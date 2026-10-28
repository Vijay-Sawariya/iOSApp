import re
import sqlite3
import unittest
from inventory_sort import address_order_sql

class AddressOrderTest(unittest.TestCase):
    def test_natural_order_and_pagination(self):
        db = sqlite3.connect(':memory:')
        db.create_function('REGEXP_REPLACE', 3, lambda value, pattern, replacement: re.sub(pattern.replace('[[:space:]/-]', r'[\s/-]'), replacement, value))
        db.create_function('CHAR_LENGTH', 1, len)
        def substring_index(value, delimiter, count):
            parts = value.split(delimiter)
            return delimiter.join(parts[:count] if count > 0 else parts[count:])
        db.create_function('SUBSTRING_INDEX', 3, substring_index)
        db.execute('CREATE TABLE entries (id INTEGER, address TEXT, location TEXT)')
        addresses = ['B-3', 'A-10', 'A-2', 'B-2', 'A-1', 'A-3', 'A-9/10', 'A-9/2', '', None]
        db.executemany('INSERT INTO entries VALUES (?, ?, ?)', [(i, address, 'Vasant Vihar') for i, address in enumerate(addresses)])
        query = 'SELECT address FROM entries e ORDER BY ' + address_order_sql('e.address') + ', e.id ASC'
        expected = ['A-1', 'A-2', 'A-3', 'A-9/2', 'A-9/10', 'A-10', 'B-2', 'B-3', '', None]
        self.assertEqual([r[0] for r in db.execute(query)], expected)
        self.assertEqual([r[0] for r in db.execute(query + ' LIMIT 3 OFFSET 3')], expected[3:6])
        grouped = 'SELECT location,address FROM entries e ORDER BY LOWER(TRIM(e.location)), ' + address_order_sql('e.address')
        db.execute("INSERT INTO entries VALUES (100, 'Z-10', 'Anand Niketan')")
        self.assertEqual(db.execute(grouped).fetchone(), ('Anand Niketan', 'Z-10'))

if __name__ == '__main__':
    unittest.main()
