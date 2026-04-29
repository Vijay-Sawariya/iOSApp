#!/usr/bin/env python3
"""
Comprehensive Lead Scoring and Map Data API Testing
Tests all specific requirements from the review request
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

print(f"Comprehensive Testing at: {API_BASE}")

class ComprehensiveTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        
    def log_test(self, test_name, success, details=""):
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   {details}")
        print()
        
    def authenticate(self):
        """Quick authentication"""
        test_data = {
            "username": f"testuser_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "password": "TestPassword123!",
            "full_name": "Comprehensive Test User",
            "email": f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}@example.com",
            "role": "user"
        }
        
        try:
            # Register and login
            self.session.post(f"{API_BASE}/auth/register", json=test_data)
            response = self.session.post(f"{API_BASE}/auth/login", json={
                "username": test_data["username"],
                "password": test_data["password"]
            })
            
            if response.status_code == 200:
                auth_data = response.json()
                self.auth_token = auth_data.get('access_token')
                self.session.headers.update({'Authorization': f'Bearer {self.auth_token}'})
                return True
        except:
            pass
        return False
    
    def test_client_leads_detailed(self):
        """Test GET /api/leads/clients with detailed field validation"""
        try:
            response = self.session.get(f"{API_BASE}/leads/clients?limit=3")
            
            if response.status_code == 200:
                leads = response.json()
                
                if not leads:
                    self.log_test("GET /api/leads/clients - Detailed Validation", True, 
                                "No client leads found - endpoint working")
                    return True
                
                lead = leads[0]
                
                # Test all required scoring fields
                required_fields = {
                    'lead_score': (int, float),
                    'days_since_contact': (int, type(None)),
                    'aging_label': str,
                    'aging_color': str,
                    'aging_urgency': str,
                    'score_breakdown': list
                }
                
                validation_results = []
                
                for field, expected_type in required_fields.items():
                    if field in lead:
                        value = lead[field]
                        if isinstance(value, expected_type):
                            validation_results.append(f"✓ {field}: {type(value).__name__}")
                            
                            # Additional validations
                            if field == 'lead_score':
                                if 0 <= value <= 100:
                                    validation_results.append(f"  ✓ Score in valid range: {value}")
                                else:
                                    validation_results.append(f"  ✗ Score out of range: {value}")
                            
                            elif field == 'aging_color':
                                valid_colors = ['green', 'blue', 'orange', 'red', 'darkred', 'gray']
                                if value in valid_colors:
                                    validation_results.append(f"  ✓ Valid color: {value}")
                                else:
                                    validation_results.append(f"  ✗ Invalid color: {value}")
                            
                            elif field == 'aging_urgency':
                                valid_urgencies = ['recent', 'good', 'attention', 'overdue', 'critical', 'unknown']
                                if value in valid_urgencies:
                                    validation_results.append(f"  ✓ Valid urgency: {value}")
                                else:
                                    validation_results.append(f"  ✗ Invalid urgency: {value}")
                            
                            elif field == 'score_breakdown':
                                if len(value) > 0 and all(len(item) >= 2 for item in value):
                                    categories = [item[0] for item in value]
                                    validation_results.append(f"  ✓ Breakdown categories: {', '.join(categories)}")
                                else:
                                    validation_results.append(f"  ✗ Invalid breakdown format")
                        else:
                            validation_results.append(f"✗ {field}: wrong type {type(value).__name__}")
                    else:
                        validation_results.append(f"✗ {field}: missing")
                
                details = "\n   ".join(validation_results)
                all_valid = all("✓" in result for result in validation_results)
                
                self.log_test("GET /api/leads/clients - Detailed Validation", all_valid, details)
                return all_valid
                
            else:
                self.log_test("GET /api/leads/clients - Detailed Validation", False, 
                            f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/leads/clients - Detailed Validation", False, f"Exception: {str(e)}")
            return False
    
    def test_inventory_leads_detailed(self):
        """Test GET /api/leads/inventory with detailed field validation"""
        try:
            response = self.session.get(f"{API_BASE}/leads/inventory?limit=3")
            
            if response.status_code == 200:
                leads = response.json()
                
                if not leads:
                    self.log_test("GET /api/leads/inventory - Detailed Validation", True, 
                                "No inventory leads found - endpoint working")
                    return True
                
                lead = leads[0]
                
                # Test scoring fields (same as client leads)
                scoring_fields = ['lead_score', 'days_since_contact', 'aging_label', 
                                'aging_color', 'aging_urgency', 'score_breakdown']
                
                validation_results = []
                
                for field in scoring_fields:
                    if field in lead:
                        validation_results.append(f"✓ {field}: present")
                    else:
                        validation_results.append(f"✗ {field}: missing")
                
                # Check for floor_pricing (specific to inventory)
                if 'floor_pricing' in lead:
                    floor_pricing = lead['floor_pricing']
                    if isinstance(floor_pricing, list):
                        validation_results.append(f"✓ floor_pricing: list with {len(floor_pricing)} items")
                    else:
                        validation_results.append(f"✗ floor_pricing: not a list")
                else:
                    validation_results.append(f"✓ floor_pricing: missing (optional)")
                
                details = "\n   ".join(validation_results)
                all_valid = all("✓" in result for result in validation_results)
                
                self.log_test("GET /api/leads/inventory - Detailed Validation", all_valid, details)
                return all_valid
                
            else:
                self.log_test("GET /api/leads/inventory - Detailed Validation", False, 
                            f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/leads/inventory - Detailed Validation", False, f"Exception: {str(e)}")
            return False
    
    def test_map_data_detailed(self):
        """Test GET /api/leads/map-data with detailed field validation"""
        try:
            # Test without filter
            response = self.session.get(f"{API_BASE}/leads/map-data")
            
            if response.status_code == 200:
                leads = response.json()
                
                if not leads:
                    self.log_test("GET /api/leads/map-data - Detailed Validation", True, 
                                "No leads with location data - endpoint working")
                    return True
                
                lead = leads[0]
                
                # Test required map data fields
                required_fields = ['id', 'name', 'lead_type', 'location', 'address',
                                 'Property_locationUrl', 'budget_min', 'budget_max']
                
                validation_results = []
                
                for field in required_fields:
                    if field in lead:
                        value = lead[field]
                        validation_results.append(f"✓ {field}: {type(value).__name__}")
                    else:
                        validation_results.append(f"✗ {field}: missing")
                
                # Test optional coordinate fields
                if 'latitude' in lead and 'longitude' in lead:
                    validation_results.append(f"✓ coordinates: lat={lead['latitude']}, lng={lead['longitude']}")
                else:
                    validation_results.append(f"✓ coordinates: not available (optional)")
                
                # Test lead_type filter
                filter_response = self.session.get(f"{API_BASE}/leads/map-data?lead_type=seller")
                if filter_response.status_code == 200:
                    filtered_leads = filter_response.json()
                    validation_results.append(f"✓ lead_type filter: {len(filtered_leads)} seller leads")
                else:
                    validation_results.append(f"✗ lead_type filter: failed")
                
                details = f"Total leads: {len(leads)}\n   " + "\n   ".join(validation_results)
                all_valid = all("✓" in result for result in validation_results)
                
                self.log_test("GET /api/leads/map-data - Detailed Validation", all_valid, details)
                return all_valid
                
            else:
                self.log_test("GET /api/leads/map-data - Detailed Validation", False, 
                            f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("GET /api/leads/map-data - Detailed Validation", False, f"Exception: {str(e)}")
            return False
    
    def test_score_calculation_accuracy(self):
        """Test the accuracy of score calculation logic"""
        try:
            response = self.session.get(f"{API_BASE}/leads/clients?limit=5")
            
            if response.status_code == 200:
                leads = response.json()
                
                if not leads:
                    self.log_test("Score Calculation Accuracy", True, "No leads to test")
                    return True
                
                validation_results = []
                
                for i, lead in enumerate(leads[:3]):  # Test first 3 leads
                    if 'score_breakdown' in lead and 'lead_score' in lead:
                        breakdown = lead['score_breakdown']
                        total_score = lead['lead_score']
                        
                        # Calculate expected score from breakdown
                        calculated_score = sum(item[1] for item in breakdown if len(item) >= 2)
                        
                        # Allow small rounding differences
                        if abs(calculated_score - total_score) <= 1:
                            validation_results.append(f"✓ Lead {i+1}: score={total_score}, calculated={calculated_score}")
                        else:
                            validation_results.append(f"✗ Lead {i+1}: score={total_score}, calculated={calculated_score}")
                        
                        # Check for expected categories
                        categories = set(item[0] for item in breakdown if len(item) >= 1)
                        expected_categories = {'Temperature', 'Recency', 'Budget', 'Status', 'Completeness'}
                        
                        if expected_categories.issubset(categories):
                            validation_results.append(f"  ✓ All expected categories present")
                        else:
                            missing = expected_categories - categories
                            validation_results.append(f"  ✗ Missing categories: {missing}")
                
                details = "\n   ".join(validation_results)
                all_valid = all("✓" in result for result in validation_results)
                
                self.log_test("Score Calculation Accuracy", all_valid, details)
                return all_valid
                
            else:
                self.log_test("Score Calculation Accuracy", False, f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Score Calculation Accuracy", False, f"Exception: {str(e)}")
            return False
    
    def run_comprehensive_tests(self):
        """Run all comprehensive tests"""
        print("=" * 80)
        print("COMPREHENSIVE LEAD SCORING & MAP DATA API TESTING")
        print("=" * 80)
        print()
        
        # Authentication
        print("🔐 AUTHENTICATION")
        print("-" * 40)
        if not self.authenticate():
            print("❌ Authentication failed - aborting tests")
            return
        print("✅ Authentication successful")
        print()
        
        # Detailed Tests
        print("📊 DETAILED LEAD SCORING TESTS")
        print("-" * 40)
        self.test_client_leads_detailed()
        self.test_inventory_leads_detailed()
        self.test_score_calculation_accuracy()
        
        print("🗺️ DETAILED MAP DATA TESTS")
        print("-" * 40)
        self.test_map_data_detailed()
        
        print("=" * 80)
        print("COMPREHENSIVE TESTING COMPLETE")
        print("=" * 80)

if __name__ == "__main__":
    tester = ComprehensiveTester()
    tester.run_comprehensive_tests()