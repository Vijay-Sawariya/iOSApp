#!/usr/bin/env python3
"""
Additional Backend API Testing for edge cases and validation
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
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://lead-mgmt-app-1.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

print(f"Testing backend edge cases at: {API_BASE}")

class LMSEdgeCaseTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        
    def log_test(self, test_name, success, details=""):
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   {details}")
        print()
    
    def setup_auth(self):
        """Setup authentication for testing"""
        # Register a test user
        test_data = {
            "username": f"edgetest_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "password": "TestPassword123!",
            "full_name": "Edge Test User",
            "email": f"edgetest_{datetime.now().strftime('%Y%m%d_%H%M%S')}@example.com",
            "role": "user"
        }
        
        response = self.session.post(f"{API_BASE}/auth/register", json=test_data)
        if response.status_code != 200:
            return False
            
        # Login
        login_data = {
            "username": test_data["username"],
            "password": test_data["password"]
        }
        
        response = self.session.post(f"{API_BASE}/auth/login", json=login_data)
        if response.status_code == 200:
            auth_data = response.json()
            self.auth_token = auth_data.get('access_token')
            self.session.headers.update({'Authorization': f'Bearer {self.auth_token}'})
            return True
        return False
    
    def test_unauthorized_access(self):
        """Test endpoints without authentication"""
        # Create a session without auth token
        unauth_session = requests.Session()
        
        endpoints_to_test = [
            "/dashboard/stats",
            "/leads",
            "/leads/clients",
            "/leads/inventory",
            "/builders",
            "/reminders"
        ]
        
        all_unauthorized = True
        for endpoint in endpoints_to_test:
            try:
                response = unauth_session.get(f"{API_BASE}{endpoint}")
                if response.status_code != 401 and response.status_code != 403:
                    all_unauthorized = False
                    break
            except Exception:
                all_unauthorized = False
                break
        
        self.log_test("Unauthorized access protection", all_unauthorized, 
                     "All protected endpoints require authentication")
    
    def test_invalid_lead_creation(self):
        """Test lead creation with invalid data"""
        if not self.auth_token:
            self.log_test("Invalid lead creation", False, "No auth token")
            return
            
        # Test with missing required field (name)
        invalid_lead = {
            "phone": "+91-9876543210",
            "email": "test@example.com"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/leads", json=invalid_lead)
            success = response.status_code == 422  # Validation error expected
            self.log_test("Invalid lead creation (missing name)", success, 
                         f"Status: {response.status_code} (expected 422)")
        except Exception as e:
            self.log_test("Invalid lead creation (missing name)", False, f"Exception: {str(e)}")
    
    def test_nonexistent_resource_access(self):
        """Test accessing non-existent resources"""
        if not self.auth_token:
            self.log_test("Non-existent resource access", False, "No auth token")
            return
            
        # Test accessing non-existent lead
        try:
            response = self.session.get(f"{API_BASE}/leads/999999")
            success = response.status_code == 404
            self.log_test("Non-existent lead access", success, 
                         f"Status: {response.status_code} (expected 404)")
        except Exception as e:
            self.log_test("Non-existent lead access", False, f"Exception: {str(e)}")
        
        # Test accessing non-existent builder
        try:
            response = self.session.get(f"{API_BASE}/builders/999999")
            success = response.status_code == 404
            self.log_test("Non-existent builder access", success, 
                         f"Status: {response.status_code} (expected 404)")
        except Exception as e:
            self.log_test("Non-existent builder access", False, f"Exception: {str(e)}")
    
    def test_lead_update_and_delete(self):
        """Test lead update and delete operations"""
        if not self.auth_token:
            self.log_test("Lead update/delete", False, "No auth token")
            return
            
        # First create a lead
        lead_data = {
            "name": "Test Lead for Update",
            "phone": "+91-9876543210",
            "email": "testupdate@example.com",
            "lead_type": "buyer",
            "location": "Mumbai",
            "bhk": "3BHK",
            "budget_min": 8000000,
            "budget_max": 10000000,
            "property_type": "Apartment",
            "lead_temperature": "Warm",
            "lead_status": "In Progress",
            "notes": "Test lead for update operations"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/leads", json=lead_data)
            if response.status_code == 200:
                lead = response.json()
                lead_id = lead.get('id')
                
                # Test update
                updated_data = lead_data.copy()
                updated_data['name'] = "Updated Test Lead"
                updated_data['lead_temperature'] = "Hot"
                
                update_response = self.session.put(f"{API_BASE}/leads/{lead_id}", json=updated_data)
                update_success = update_response.status_code == 200
                
                # Test delete
                delete_response = self.session.delete(f"{API_BASE}/leads/{lead_id}")
                delete_success = delete_response.status_code == 200
                
                overall_success = update_success and delete_success
                self.log_test("Lead update and delete", overall_success, 
                             f"Update: {update_response.status_code}, Delete: {delete_response.status_code}")
            else:
                self.log_test("Lead update and delete", False, "Failed to create test lead")
                
        except Exception as e:
            self.log_test("Lead update and delete", False, f"Exception: {str(e)}")
    
    def test_builder_operations(self):
        """Test builder update and delete operations"""
        if not self.auth_token:
            self.log_test("Builder operations", False, "No auth token")
            return
            
        # Create a builder
        builder_data = {
            "builder_name": "Test Builder for Operations",
            "company_name": "Test Builder Company",
            "phone": "+91-9876543212",
            "address": "Test Address, Mumbai"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/builders", json=builder_data)
            if response.status_code == 200:
                builder = response.json()
                builder_id = builder.get('id')
                
                # Test update
                updated_data = builder_data.copy()
                updated_data['builder_name'] = "Updated Test Builder"
                
                update_response = self.session.put(f"{API_BASE}/builders/{builder_id}", json=updated_data)
                update_success = update_response.status_code == 200
                
                # Test delete
                delete_response = self.session.delete(f"{API_BASE}/builders/{builder_id}")
                delete_success = delete_response.status_code == 200
                
                overall_success = update_success and delete_success
                self.log_test("Builder update and delete", overall_success, 
                             f"Update: {update_response.status_code}, Delete: {delete_response.status_code}")
            else:
                self.log_test("Builder operations", False, "Failed to create test builder")
                
        except Exception as e:
            self.log_test("Builder operations", False, f"Exception: {str(e)}")
    
    def test_reminder_delete(self):
        """Test reminder delete operation"""
        if not self.auth_token:
            self.log_test("Reminder delete", False, "No auth token")
            return
            
        # Create a reminder
        reminder_data = {
            "title": "Test Reminder for Delete",
            "reminder_date": (datetime.now() + timedelta(days=1)).isoformat(),
            "reminder_type": "email",
            "notes": "Test reminder for delete operation",
            "status": "pending"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/reminders", json=reminder_data)
            if response.status_code == 200:
                reminder = response.json()
                reminder_id = reminder.get('id')
                
                # Test delete
                delete_response = self.session.delete(f"{API_BASE}/reminders/{reminder_id}")
                success = delete_response.status_code == 200
                
                self.log_test("Reminder delete", success, 
                             f"Delete status: {delete_response.status_code}")
            else:
                self.log_test("Reminder delete", False, "Failed to create test reminder")
                
        except Exception as e:
            self.log_test("Reminder delete", False, f"Exception: {str(e)}")
    
    def run_edge_case_tests(self):
        """Run all edge case tests"""
        print("=" * 60)
        print("SAGAR HOME LMS BACKEND EDGE CASE TESTING")
        print("=" * 60)
        print()
        
        # Setup authentication
        if not self.setup_auth():
            print("❌ Failed to setup authentication - skipping tests")
            return
        
        print("🔒 SECURITY TESTS")
        print("-" * 30)
        self.test_unauthorized_access()
        
        print("🚫 VALIDATION TESTS")
        print("-" * 30)
        self.test_invalid_lead_creation()
        self.test_nonexistent_resource_access()
        
        print("🔄 CRUD OPERATION TESTS")
        print("-" * 30)
        self.test_lead_update_and_delete()
        self.test_builder_operations()
        self.test_reminder_delete()
        
        print("=" * 60)
        print("EDGE CASE TESTING COMPLETE")
        print("=" * 60)

if __name__ == "__main__":
    tester = LMSEdgeCaseTester()
    tester.run_edge_case_tests()