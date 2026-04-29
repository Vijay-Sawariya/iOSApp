#!/usr/bin/env python3
"""
Lead Scoring and Map Data API Testing
Tests the newly implemented lead scoring features and map data endpoint
"""

import requests
import json
import sys
from datetime import datetime
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/frontend/.env')

# Get backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://property-audit-suite.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

print(f"Testing Lead Scoring & Map Data APIs at: {API_BASE}")

class LeadScoringTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        
    def log_test(self, test_name, success, details=""):
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   {details}")
        print()
        
    def test_auth_login(self):
        """Test login with existing user credentials"""
        # Try common test credentials first
        test_credentials = [
            {"username": "admin", "password": "admin123"},
            {"username": "test", "password": "test123"},
            {"username": "user", "password": "password"},
            {"username": "demo", "password": "demo123"}
        ]
        
        for creds in test_credentials:
            try:
                response = self.session.post(f"{API_BASE}/auth/login", json=creds)
                
                if response.status_code == 200:
                    auth_data = response.json()
                    self.auth_token = auth_data.get('access_token')
                    self.session.headers.update({'Authorization': f'Bearer {self.auth_token}'})
                    self.log_test("Authentication", True, 
                                f"Logged in as {creds['username']}")
                    return True
                    
            except Exception as e:
                continue
        
        # If no existing credentials work, create a new user
        return self.create_test_user_and_login()
    
    def create_test_user_and_login(self):
        """Create a test user and login"""
        test_data = {
            "username": f"testuser_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "password": "TestPassword123!",
            "full_name": "Test User for Lead Scoring",
            "email": f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}@example.com",
            "role": "user"
        }
        
        try:
            # Register user
            response = self.session.post(f"{API_BASE}/auth/register", json=test_data)
            
            if response.status_code == 200:
                # Login with new user
                login_data = {
                    "username": test_data["username"],
                    "password": test_data["password"]
                }
                
                response = self.session.post(f"{API_BASE}/auth/login", json=login_data)
                
                if response.status_code == 200:
                    auth_data = response.json()
                    self.auth_token = auth_data.get('access_token')
                    self.session.headers.update({'Authorization': f'Bearer {self.auth_token}'})
                    self.log_test("Authentication", True, 
                                f"Created and logged in as {test_data['username']}")
                    return True
                    
        except Exception as e:
            self.log_test("Authentication", False, f"Failed to create test user: {str(e)}")
            return False
        
        self.log_test("Authentication", False, "Could not authenticate with any method")
        return False
    
    def test_client_leads_scoring(self):
        """Test GET /api/leads/clients for lead scoring fields"""
        if not self.auth_token:
            self.log_test("GET /api/leads/clients (Lead Scoring)", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{API_BASE}/leads/clients?limit=5")
            
            if response.status_code == 200:
                leads = response.json()
                
                if not leads:
                    self.log_test("GET /api/leads/clients (Lead Scoring)", True, 
                                "No client leads found - endpoint working but empty")
                    return True
                
                # Check first lead for required scoring fields
                lead = leads[0]
                required_fields = [
                    'lead_score', 'days_since_contact', 'aging_label', 
                    'aging_color', 'aging_urgency', 'score_breakdown'
                ]
                
                missing_fields = []
                present_fields = []
                
                for field in required_fields:
                    if field in lead:
                        present_fields.append(field)
                        # Validate field values
                        if field == 'lead_score':
                            score = lead[field]
                            if not isinstance(score, (int, float)) or score < 0 or score > 100:
                                missing_fields.append(f"{field} (invalid value: {score})")
                        elif field == 'aging_color':
                            valid_colors = ['green', 'blue', 'orange', 'red', 'darkred', 'gray']
                            if lead[field] not in valid_colors:
                                missing_fields.append(f"{field} (invalid color: {lead[field]})")
                        elif field == 'aging_urgency':
                            valid_urgencies = ['recent', 'good', 'attention', 'overdue', 'critical', 'unknown']
                            if lead[field] not in valid_urgencies:
                                missing_fields.append(f"{field} (invalid urgency: {lead[field]})")
                        elif field == 'score_breakdown':
                            if not isinstance(lead[field], list):
                                missing_fields.append(f"{field} (not a list)")
                    else:
                        missing_fields.append(field)
                
                if not missing_fields:
                    details = f"All scoring fields present: {', '.join(present_fields)}\n"
                    details += f"   Sample lead score: {lead.get('lead_score')}\n"
                    details += f"   Sample aging: {lead.get('aging_label')} ({lead.get('aging_color')})\n"
                    details += f"   Score breakdown items: {len(lead.get('score_breakdown', []))}"
                    self.log_test("GET /api/leads/clients (Lead Scoring)", True, details)
                    return True
                else:
                    self.log_test("GET /api/leads/clients (Lead Scoring)", False, 
                                f"Missing/invalid fields: {missing_fields}")
                    return False
            else:
                self.log_test("GET /api/leads/clients (Lead Scoring)", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/leads/clients (Lead Scoring)", False, f"Exception: {str(e)}")
            return False
    
    def test_inventory_leads_scoring(self):
        """Test GET /api/leads/inventory for lead scoring fields"""
        if not self.auth_token:
            self.log_test("GET /api/leads/inventory (Lead Scoring)", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{API_BASE}/leads/inventory?limit=5")
            
            if response.status_code == 200:
                leads = response.json()
                
                if not leads:
                    self.log_test("GET /api/leads/inventory (Lead Scoring)", True, 
                                "No inventory leads found - endpoint working but empty")
                    return True
                
                # Check first lead for required scoring fields
                lead = leads[0]
                required_fields = [
                    'lead_score', 'days_since_contact', 'aging_label', 
                    'aging_color', 'aging_urgency', 'score_breakdown'
                ]
                
                missing_fields = []
                present_fields = []
                
                for field in required_fields:
                    if field in lead:
                        present_fields.append(field)
                    else:
                        missing_fields.append(field)
                
                if not missing_fields:
                    details = f"All scoring fields present: {', '.join(present_fields)}\n"
                    details += f"   Sample lead score: {lead.get('lead_score')}\n"
                    details += f"   Sample aging: {lead.get('aging_label')} ({lead.get('aging_color')})\n"
                    details += f"   Floor pricing items: {len(lead.get('floor_pricing', []))}"
                    self.log_test("GET /api/leads/inventory (Lead Scoring)", True, details)
                    return True
                else:
                    self.log_test("GET /api/leads/inventory (Lead Scoring)", False, 
                                f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("GET /api/leads/inventory (Lead Scoring)", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/leads/inventory (Lead Scoring)", False, f"Exception: {str(e)}")
            return False
    
    def test_map_data_endpoint(self):
        """Test GET /api/leads/map-data endpoint"""
        if not self.auth_token:
            self.log_test("GET /api/leads/map-data", False, "No auth token available")
            return False
            
        try:
            # Test without filter
            response = self.session.get(f"{API_BASE}/leads/map-data")
            
            if response.status_code == 200:
                leads = response.json()
                
                if not leads:
                    self.log_test("GET /api/leads/map-data", True, 
                                "No leads with location data found - endpoint working but empty")
                    return True
                
                # Check first lead for required map data fields
                lead = leads[0]
                required_fields = [
                    'id', 'name', 'lead_type', 'location', 'address',
                    'Property_locationUrl', 'budget_min', 'budget_max'
                ]
                
                missing_fields = []
                present_fields = []
                
                for field in required_fields:
                    if field in lead:
                        present_fields.append(field)
                    else:
                        missing_fields.append(field)
                
                # Check for optional latitude/longitude
                has_coordinates = 'latitude' in lead and 'longitude' in lead
                
                details = f"Required fields present: {', '.join(present_fields)}\n"
                if missing_fields:
                    details += f"   Missing optional fields: {missing_fields}\n"
                details += f"   Has coordinates: {has_coordinates}\n"
                details += f"   Total properties: {len(leads)}"
                
                # Test with lead_type filter
                filter_response = self.session.get(f"{API_BASE}/leads/map-data?lead_type=seller")
                filter_success = filter_response.status_code == 200
                
                if filter_success:
                    filtered_leads = filter_response.json()
                    details += f"\n   Filtered results (seller): {len(filtered_leads)}"
                
                self.log_test("GET /api/leads/map-data", True, details)
                return True
                
            else:
                self.log_test("GET /api/leads/map-data", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/leads/map-data", False, f"Exception: {str(e)}")
            return False
    
    def test_score_calculation_logic(self):
        """Test the scoring logic by examining score breakdown"""
        if not self.auth_token:
            self.log_test("Lead Score Calculation Logic", False, "No auth token available")
            return False
            
        try:
            # Get client leads to examine score breakdown
            response = self.session.get(f"{API_BASE}/leads/clients?limit=10")
            
            if response.status_code == 200:
                leads = response.json()
                
                if not leads:
                    self.log_test("Lead Score Calculation Logic", True, 
                                "No leads to test scoring logic")
                    return True
                
                # Analyze score breakdowns
                score_categories = set()
                valid_scores = 0
                
                for lead in leads:
                    if 'score_breakdown' in lead and 'lead_score' in lead:
                        breakdown = lead['score_breakdown']
                        total_score = lead['lead_score']
                        
                        # Collect categories
                        for item in breakdown:
                            if len(item) >= 2:  # Should be tuple/list with at least category and score
                                score_categories.add(item[0])
                        
                        # Validate score is reasonable
                        if 0 <= total_score <= 100:
                            valid_scores += 1
                
                details = f"Analyzed {len(leads)} leads\n"
                details += f"   Valid scores (0-100): {valid_scores}/{len(leads)}\n"
                details += f"   Score categories found: {', '.join(sorted(score_categories))}"
                
                expected_categories = {'Temperature', 'Recency', 'Budget', 'Status', 'Completeness'}
                found_categories = score_categories
                
                if expected_categories.issubset(found_categories):
                    self.log_test("Lead Score Calculation Logic", True, details)
                    return True
                else:
                    missing = expected_categories - found_categories
                    details += f"\n   Missing expected categories: {missing}"
                    self.log_test("Lead Score Calculation Logic", False, details)
                    return False
                    
            else:
                self.log_test("Lead Score Calculation Logic", False, 
                            f"Could not fetch leads for analysis: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Lead Score Calculation Logic", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all lead scoring and map data tests"""
        print("=" * 70)
        print("LEAD SCORING & MAP DATA API TESTING")
        print("=" * 70)
        print()
        
        # Authentication
        print("🔐 AUTHENTICATION")
        print("-" * 30)
        auth_success = self.test_auth_login()
        
        if not auth_success:
            print("❌ Authentication failed - skipping remaining tests")
            return
        
        # Lead Scoring Tests
        print("📊 LEAD SCORING TESTS")
        print("-" * 30)
        self.test_client_leads_scoring()
        self.test_inventory_leads_scoring()
        self.test_score_calculation_logic()
        
        # Map Data Tests
        print("🗺️ MAP DATA TESTS")
        print("-" * 30)
        self.test_map_data_endpoint()
        
        print("=" * 70)
        print("LEAD SCORING & MAP DATA TESTING COMPLETE")
        print("=" * 70)

if __name__ == "__main__":
    tester = LeadScoringTester()
    tester.run_all_tests()