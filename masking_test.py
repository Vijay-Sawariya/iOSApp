#!/usr/bin/env python3
"""
Backend API Testing for Sagar Home LMS - Phone/Address Masking Security Feature
Tests phone number masking based on user role and lead ownership
"""

import requests
import json
from typing import Dict, Optional

# Backend URL from environment
BACKEND_URL = "https://lead-mgmt-app-1.preview.emergentagent.com/api"

# Test credentials
ADMIN_USER = {
    "username": "vsawariya",
    "password": "Welcome@LMS"
}

NON_ADMIN_USER = {
    "username": "shweta",
    "password": "1234"
}

# Expected data context
EXPECTED_DATA = {
    "shweta_user_id": 2,
    "shweta_lead": {
        "name": "Internal Calling",
        "phone": "9910014333"
    },
    "vsawariya_user_id": 1,
    "vsawariya_lead": {
        "name": "Ravi Dayal",
        "phone": "9818049120"
    },
    "vikas_user_id": 5,
    "vikas_lead": {
        "name": "Harikishan"
    }
}

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'
    BOLD = '\033[1m'

def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*80}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*80}{Colors.END}\n")

def print_success(text: str):
    print(f"{Colors.GREEN}✓ {text}{Colors.END}")

def print_error(text: str):
    print(f"{Colors.RED}✗ {text}{Colors.END}")

def print_warning(text: str):
    print(f"{Colors.YELLOW}⚠ {text}{Colors.END}")

def print_info(text: str):
    print(f"{Colors.BLUE}ℹ {text}{Colors.END}")

def login(username: str, password: str) -> Optional[str]:
    """Login and return JWT token"""
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"username": username, "password": password},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('access_token')
            print_success(f"Login successful for user: {username}")
            return token
        else:
            print_error(f"Login failed for {username}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print_error(f"Login error for {username}: {str(e)}")
        return None

def get_user_info(token: str) -> Optional[Dict]:
    """Get current user information"""
    try:
        response = requests.get(
            f"{BACKEND_URL}/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            print_error(f"Failed to get user info: {response.status_code}")
            return None
    except Exception as e:
        print_error(f"Error getting user info: {str(e)}")
        return None

def is_phone_masked(phone: str) -> bool:
    """Check if a phone number is masked (contains X characters)"""
    return 'X' in str(phone).upper() if phone else False

def mask_phone(phone: str) -> str:
    """Expected masking format: show first 2 and last 2 digits, mask middle"""
    if not phone or len(phone) < 4:
        return phone
    phone_str = str(phone)
    return f"{phone_str[:2]}{'X' * (len(phone_str) - 4)}{phone_str[-2:]}"

def test_leads_clients_endpoint(token: str, user_info: Dict):
    """Test GET /api/leads/clients endpoint for phone masking"""
    print_header(f"Testing /api/leads/clients for user: {user_info['username']} (role: {user_info.get('role', 'N/A')})")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/leads/clients",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            print_error(f"API call failed: {response.status_code} - {response.text}")
            return False
        
        leads = response.json()
        print_info(f"Retrieved {len(leads)} client leads")
        
        # Check if created_by field is present
        has_created_by = False
        has_created_by_name = False
        masking_working = True
        issues = []
        
        for lead in leads[:10]:  # Check first 10 leads
            lead_name = lead.get('name', 'Unknown')
            lead_phone = lead.get('phone', 'N/A')
            created_by = lead.get('created_by')
            created_by_name = lead.get('created_by_name')
            
            if created_by is not None:
                has_created_by = True
            if created_by_name is not None:
                has_created_by_name = True
            
            # Check masking logic
            is_admin = user_info.get('role') == 'admin'
            is_owner = created_by == user_info.get('id')
            
            should_be_masked = not is_admin and not is_owner
            is_masked = is_phone_masked(lead_phone)
            
            print(f"\n  Lead: {lead_name}")
            print(f"    Phone: {lead_phone}")
            print(f"    Created by: {created_by} ({created_by_name})")
            print(f"    Is owner: {is_owner}, Is admin: {is_admin}")
            print(f"    Should be masked: {should_be_masked}, Is masked: {is_masked}")
            
            if should_be_masked and not is_masked:
                issue = f"Phone NOT masked for lead '{lead_name}' (created_by={created_by}, phone={lead_phone})"
                issues.append(issue)
                print_error(f"    ISSUE: {issue}")
                masking_working = False
            elif not should_be_masked and is_masked:
                issue = f"Phone incorrectly masked for lead '{lead_name}' (user should see full phone)"
                issues.append(issue)
                print_error(f"    ISSUE: {issue}")
                masking_working = False
            else:
                print_success(f"    Masking correct for this lead")
        
        # Summary
        print(f"\n{Colors.BOLD}Summary:{Colors.END}")
        print(f"  created_by field present: {has_created_by}")
        print(f"  created_by_name field present: {has_created_by_name}")
        
        if not has_created_by:
            print_error("  CRITICAL: created_by field is MISSING from API response")
            issues.append("created_by field missing from /api/leads/clients response")
        
        if masking_working and has_created_by:
            print_success("  Phone masking is working correctly")
            return True
        else:
            print_error("  Phone masking is NOT working correctly")
            for issue in issues:
                print_error(f"    - {issue}")
            return False
            
    except Exception as e:
        print_error(f"Error testing /api/leads/clients: {str(e)}")
        return False

def test_urgent_followups_endpoint(token: str, user_info: Dict):
    """Test GET /api/ai/urgent-followups endpoint"""
    print_header(f"Testing /api/ai/urgent-followups for user: {user_info['username']}")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/ai/urgent-followups?limit=5",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            print_error(f"API call failed: {response.status_code} - {response.text}")
            return False
        
        followups = response.json()
        print_info(f"Retrieved {len(followups)} urgent follow-ups")
        
        has_created_by = False
        masking_working = True
        issues = []
        
        for followup in followups:
            lead_name = followup.get('lead_name', 'Unknown')
            lead_phone = followup.get('lead_phone', 'N/A')
            created_by = followup.get('created_by')
            
            if created_by is not None:
                has_created_by = True
            
            is_admin = user_info.get('role') == 'admin'
            is_owner = created_by == user_info.get('id')
            should_be_masked = not is_admin and not is_owner
            is_masked = is_phone_masked(lead_phone)
            
            print(f"\n  Follow-up: {followup.get('title', 'N/A')}")
            print(f"    Lead: {lead_name}, Phone: {lead_phone}")
            print(f"    Created by: {created_by}")
            print(f"    Should be masked: {should_be_masked}, Is masked: {is_masked}")
            
            if should_be_masked and not is_masked:
                issue = f"Phone NOT masked for follow-up lead '{lead_name}'"
                issues.append(issue)
                print_error(f"    ISSUE: {issue}")
                masking_working = False
            elif not should_be_masked and is_masked:
                issue = f"Phone incorrectly masked for follow-up lead '{lead_name}'"
                issues.append(issue)
                print_error(f"    ISSUE: {issue}")
                masking_working = False
            else:
                print_success(f"    Masking correct")
        
        print(f"\n{Colors.BOLD}Summary:{Colors.END}")
        print(f"  created_by field present: {has_created_by}")
        
        if not has_created_by:
            print_error("  CRITICAL: created_by field is MISSING from API response")
            issues.append("created_by field missing from /api/ai/urgent-followups response")
        
        if masking_working and has_created_by:
            print_success("  Phone masking is working correctly")
            return True
        else:
            print_error("  Phone masking is NOT working correctly")
            for issue in issues:
                print_error(f"    - {issue}")
            return False
            
    except Exception as e:
        print_error(f"Error testing /api/ai/urgent-followups: {str(e)}")
        return False

def test_reminders_endpoint(token: str, user_info: Dict):
    """Test GET /api/reminders endpoint"""
    print_header(f"Testing /api/reminders for user: {user_info['username']}")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/reminders",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            print_error(f"API call failed: {response.status_code} - {response.text}")
            return False
        
        reminders = response.json()
        print_info(f"Retrieved {len(reminders)} reminders")
        
        has_lead_created_by = False
        masking_working = True
        issues = []
        
        for reminder in reminders[:10]:  # Check first 10
            lead_name = reminder.get('lead_name', 'Unknown')
            lead_phone = reminder.get('lead_phone', 'N/A')
            lead_created_by = reminder.get('lead_created_by')
            
            if lead_created_by is not None:
                has_lead_created_by = True
            
            is_admin = user_info.get('role') == 'admin'
            is_owner = lead_created_by == user_info.get('id')
            should_be_masked = not is_admin and not is_owner
            is_masked = is_phone_masked(lead_phone)
            
            print(f"\n  Reminder: {reminder.get('title', 'N/A')}")
            print(f"    Lead: {lead_name}, Phone: {lead_phone}")
            print(f"    Lead created by: {lead_created_by}")
            print(f"    Should be masked: {should_be_masked}, Is masked: {is_masked}")
            
            if should_be_masked and not is_masked:
                issue = f"Phone NOT masked for reminder lead '{lead_name}'"
                issues.append(issue)
                print_error(f"    ISSUE: {issue}")
                masking_working = False
            elif not should_be_masked and is_masked:
                issue = f"Phone incorrectly masked for reminder lead '{lead_name}'"
                issues.append(issue)
                print_error(f"    ISSUE: {issue}")
                masking_working = False
            else:
                print_success(f"    Masking correct")
        
        print(f"\n{Colors.BOLD}Summary:{Colors.END}")
        print(f"  lead_created_by field present: {has_lead_created_by}")
        
        if not has_lead_created_by:
            print_error("  CRITICAL: lead_created_by field is MISSING from API response")
            issues.append("lead_created_by field missing from /api/reminders response")
        
        if masking_working and has_lead_created_by:
            print_success("  Phone masking is working correctly")
            return True
        else:
            print_error("  Phone masking is NOT working correctly")
            for issue in issues:
                print_error(f"    - {issue}")
            return False
            
    except Exception as e:
        print_error(f"Error testing /api/reminders: {str(e)}")
        return False

def main():
    print_header("PHONE/ADDRESS MASKING SECURITY FEATURE TEST")
    print_info(f"Backend URL: {BACKEND_URL}")
    
    results = {
        "admin": {},
        "non_admin": {}
    }
    
    # Test with admin user
    print_header("TESTING WITH ADMIN USER (vsawariya)")
    admin_token = login(ADMIN_USER['username'], ADMIN_USER['password'])
    
    if admin_token:
        admin_info = get_user_info(admin_token)
        if admin_info:
            print_info(f"User ID: {admin_info.get('id')}, Role: {admin_info.get('role')}")
            results['admin']['leads_clients'] = test_leads_clients_endpoint(admin_token, admin_info)
            results['admin']['urgent_followups'] = test_urgent_followups_endpoint(admin_token, admin_info)
            results['admin']['reminders'] = test_reminders_endpoint(admin_token, admin_info)
    
    # Test with non-admin user
    print_header("TESTING WITH NON-ADMIN USER (shweta)")
    non_admin_token = login(NON_ADMIN_USER['username'], NON_ADMIN_USER['password'])
    
    if non_admin_token:
        non_admin_info = get_user_info(non_admin_token)
        if non_admin_info:
            print_info(f"User ID: {non_admin_info.get('id')}, Role: {non_admin_info.get('role')}")
            results['non_admin']['leads_clients'] = test_leads_clients_endpoint(non_admin_token, non_admin_info)
            results['non_admin']['urgent_followups'] = test_urgent_followups_endpoint(non_admin_token, non_admin_info)
            results['non_admin']['reminders'] = test_reminders_endpoint(non_admin_token, non_admin_info)
    
    # Final summary
    print_header("FINAL TEST RESULTS")
    
    all_passed = True
    for user_type, endpoints in results.items():
        print(f"\n{Colors.BOLD}{user_type.upper()} USER:{Colors.END}")
        for endpoint, passed in endpoints.items():
            if passed:
                print_success(f"  {endpoint}: PASSED")
            else:
                print_error(f"  {endpoint}: FAILED")
                all_passed = False
    
    print("\n" + "="*80)
    if all_passed:
        print_success("ALL TESTS PASSED ✓")
    else:
        print_error("SOME TESTS FAILED ✗")
    print("="*80 + "\n")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    exit(main())
