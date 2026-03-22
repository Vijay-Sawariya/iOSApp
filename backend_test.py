#!/usr/bin/env python3
"""
Backend API Testing for Sagar Home LMS
Tests all endpoints with MySQL database integration
"""

import requests
import json
import sys
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/frontend/.env')

# Get backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://build-remind-1.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

print(f"Testing backend at: {API_BASE}")

class LMSAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.test_user_id = None
        self.test_lead_id = None
        self.test_builder_id = None
        self.test_reminder_id = None
        
    def log_test(self, test_name, success, details=""):
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   {details}")
        print()
        
    def test_auth_register(self):
        """Test user registration"""
        test_data = {
            "username": f"testuser_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "password": "TestPassword123!",
            "full_name": "Test User",
            "email": f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}@example.com",
            "role": "user"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/auth/register", json=test_data)
            
            if response.status_code == 200:
                user_data = response.json()
                self.test_user_id = user_data.get('id')
                self.log_test("POST /api/auth/register", True, 
                            f"User created with ID: {self.test_user_id}")
                return test_data
            else:
                self.log_test("POST /api/auth/register", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return None
                
        except Exception as e:
            self.log_test("POST /api/auth/register", False, f"Exception: {str(e)}")
            return None
    
    def test_auth_login(self, credentials):
        """Test user login"""
        if not credentials:
            self.log_test("POST /api/auth/login", False, "No credentials from registration")
            return False
            
        login_data = {
            "username": credentials["username"],
            "password": credentials["password"]
        }
        
        try:
            response = self.session.post(f"{API_BASE}/auth/login", json=login_data)
            
            if response.status_code == 200:
                auth_data = response.json()
                self.auth_token = auth_data.get('access_token')
                self.session.headers.update({'Authorization': f'Bearer {self.auth_token}'})
                self.log_test("POST /api/auth/login", True, 
                            f"Token received: {self.auth_token[:20]}...")
                return True
            else:
                self.log_test("POST /api/auth/login", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("POST /api/auth/login", False, f"Exception: {str(e)}")
            return False
    
    def test_auth_me(self):
        """Test get current user"""
        if not self.auth_token:
            self.log_test("GET /api/auth/me", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{API_BASE}/auth/me")
            
            if response.status_code == 200:
                user_data = response.json()
                self.log_test("GET /api/auth/me", True, 
                            f"User: {user_data.get('username')} ({user_data.get('full_name')})")
                return True
            else:
                self.log_test("GET /api/auth/me", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/auth/me", False, f"Exception: {str(e)}")
            return False
    
    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        if not self.auth_token:
            self.log_test("GET /api/dashboard/stats", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{API_BASE}/dashboard/stats")
            
            if response.status_code == 200:
                stats = response.json()
                expected_fields = ['total_leads', 'client_leads', 'inventory_leads', 
                                 'hot_leads', 'warm_leads', 'cold_leads', 'total_builders',
                                 'today_reminders', 'pending_reminders']
                
                missing_fields = [field for field in expected_fields if field not in stats]
                
                if not missing_fields:
                    self.log_test("GET /api/dashboard/stats", True, 
                                f"Stats: {stats['total_leads']} total leads, {stats['total_builders']} builders")
                    return True
                else:
                    self.log_test("GET /api/dashboard/stats", False, 
                                f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("GET /api/dashboard/stats", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/dashboard/stats", False, f"Exception: {str(e)}")
            return False
    
    def test_get_all_leads(self):
        """Test get all leads"""
        if not self.auth_token:
            self.log_test("GET /api/leads", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{API_BASE}/leads?limit=5")
            
            if response.status_code == 200:
                leads = response.json()
                self.log_test("GET /api/leads", True, 
                            f"Retrieved {len(leads)} leads")
                return True
            else:
                self.log_test("GET /api/leads", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/leads", False, f"Exception: {str(e)}")
            return False
    
    def test_get_client_leads(self):
        """Test get client leads (buyer, tenant)"""
        if not self.auth_token:
            self.log_test("GET /api/leads/clients", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{API_BASE}/leads/clients?limit=5")
            
            if response.status_code == 200:
                leads = response.json()
                self.log_test("GET /api/leads/clients", True, 
                            f"Retrieved {len(leads)} client leads")
                return True
            else:
                self.log_test("GET /api/leads/clients", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/leads/clients", False, f"Exception: {str(e)}")
            return False
    
    def test_get_inventory_leads(self):
        """Test get inventory leads (seller, landlord, builder)"""
        if not self.auth_token:
            self.log_test("GET /api/leads/inventory", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{API_BASE}/leads/inventory?limit=5")
            
            if response.status_code == 200:
                leads = response.json()
                self.log_test("GET /api/leads/inventory", True, 
                            f"Retrieved {len(leads)} inventory leads")
                return True
            else:
                self.log_test("GET /api/leads/inventory", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/leads/inventory", False, f"Exception: {str(e)}")
            return False
    
    def test_create_lead(self):
        """Test create new lead"""
        if not self.auth_token:
            self.log_test("POST /api/leads", False, "No auth token available")
            return False
            
        lead_data = {
            "name": "Rajesh Kumar",
            "phone": "+91-9876543210",
            "email": "rajesh.kumar@example.com",
            "lead_type": "buyer",
            "location": "Pune",
            "bhk": "2BHK",
            "budget_min": 5000000,
            "budget_max": 7000000,
            "property_type": "Apartment",
            "lead_temperature": "Hot",
            "lead_status": "New",
            "notes": "Looking for 2BHK apartment in Pune with good connectivity"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/leads", json=lead_data)
            
            if response.status_code == 200:
                lead = response.json()
                self.test_lead_id = lead.get('id')
                self.log_test("POST /api/leads", True, 
                            f"Lead created with ID: {self.test_lead_id}")
                return True
            else:
                self.log_test("POST /api/leads", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("POST /api/leads", False, f"Exception: {str(e)}")
            return False
    
    def test_get_builders(self):
        """Test get all builders"""
        if not self.auth_token:
            self.log_test("GET /api/builders", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{API_BASE}/builders?limit=5")
            
            if response.status_code == 200:
                builders = response.json()
                self.log_test("GET /api/builders", True, 
                            f"Retrieved {len(builders)} builders")
                return True
            else:
                self.log_test("GET /api/builders", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/builders", False, f"Exception: {str(e)}")
            return False
    
    def test_create_builder(self):
        """Test create new builder"""
        if not self.auth_token:
            self.log_test("POST /api/builders", False, "No auth token available")
            return False
            
        builder_data = {
            "builder_name": "Godrej Properties",
            "company_name": "Godrej Properties Ltd",
            "phone": "+91-9876543211",
            "address": "Mumbai, Maharashtra"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/builders", json=builder_data)
            
            if response.status_code == 200:
                builder = response.json()
                self.test_builder_id = builder.get('id')
                self.log_test("POST /api/builders", True, 
                            f"Builder created with ID: {self.test_builder_id}")
                return True
            else:
                self.log_test("POST /api/builders", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("POST /api/builders", False, f"Exception: {str(e)}")
            return False
    
    def test_get_reminders(self):
        """Test get all reminders"""
        if not self.auth_token:
            self.log_test("GET /api/reminders", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{API_BASE}/reminders?limit=5")
            
            if response.status_code == 200:
                reminders = response.json()
                self.log_test("GET /api/reminders", True, 
                            f"Retrieved {len(reminders)} reminders")
                return True
            else:
                self.log_test("GET /api/reminders", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/reminders", False, f"Exception: {str(e)}")
            return False
    
    def test_create_reminder(self):
        """Test create new reminder"""
        if not self.auth_token:
            self.log_test("POST /api/reminders", False, "No auth token available")
            return False
            
        # Use the test lead ID if available, otherwise None
        reminder_data = {
            "lead_id": self.test_lead_id,
            "title": "Follow up with client",
            "reminder_date": (datetime.now() + timedelta(days=1)).isoformat(),
            "reminder_type": "call",
            "notes": "Call to discuss property requirements",
            "status": "pending"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/reminders", json=reminder_data)
            
            if response.status_code == 200:
                reminder = response.json()
                self.test_reminder_id = reminder.get('id')
                self.log_test("POST /api/reminders", True, 
                            f"Reminder created with ID: {self.test_reminder_id}")
                return True
            else:
                self.log_test("POST /api/reminders", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("POST /api/reminders", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all API tests"""
        print("=" * 60)
        print("SAGAR HOME LMS BACKEND API TESTING")
        print("=" * 60)
        print()
        
        # Authentication Tests
        print("🔐 AUTHENTICATION TESTS")
        print("-" * 30)
        credentials = self.test_auth_register()
        login_success = self.test_auth_login(credentials)
        self.test_auth_me()
        
        if not login_success:
            print("❌ Authentication failed - skipping remaining tests")
            return
        
        # Dashboard Tests
        print("📊 DASHBOARD TESTS")
        print("-" * 30)
        self.test_dashboard_stats()
        
        # Lead Tests
        print("👥 LEAD TESTS")
        print("-" * 30)
        self.test_get_all_leads()
        self.test_get_client_leads()
        self.test_get_inventory_leads()
        self.test_create_lead()
        
        # Builder Tests
        print("🏗️ BUILDER TESTS")
        print("-" * 30)
        self.test_get_builders()
        self.test_create_builder()
        
        # Reminder Tests
        print("⏰ REMINDER TESTS")
        print("-" * 30)
        self.test_get_reminders()
        self.test_create_reminder()
        
        print("=" * 60)
        print("TESTING COMPLETE")
        print("=" * 60)

if __name__ == "__main__":
    tester = LMSAPITester()
    tester.run_all_tests()