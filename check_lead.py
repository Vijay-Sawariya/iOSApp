#!/usr/bin/env python3
import pymysql
from pymysql.cursors import DictCursor
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

MYSQL_CONFIG = {
    'host': os.environ.get('MYSQL_HOST'),
    'port': int(os.environ.get('MYSQL_PORT', 3306)),
    'user': os.environ.get('MYSQL_USER'),
    'password': os.environ.get('MYSQL_PASSWORD'),
    'database': os.environ.get('MYSQL_DATABASE'),
    'charset': 'utf8mb4',
    'cursorclass': DictCursor
}

conn = pymysql.connect(**MYSQL_CONFIG)
cursor = conn.cursor()

# Check the lead with ID 678
cursor.execute("SELECT id, name, phone, created_by FROM leads WHERE id = 678")
lead = cursor.fetchone()
print("Lead 678:", lead)

# Check the action
cursor.execute("""
    SELECT a.id, a.lead_id, a.title, a.due_date, a.due_time, a.status,
           l.name as lead_name, l.phone as lead_phone, l.lead_type, l.created_by
    FROM actions a
    JOIN leads l ON a.lead_id = l.id
    WHERE a.id = 63
""")
action = cursor.fetchone()
print("\nAction 63:", action)

cursor.close()
conn.close()
