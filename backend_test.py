#!/usr/bin/env python3
"""
Backend API Testing for Phone/Address Masking Security Feature
Tests authentication and masking behavior for admin and non-admin users
"""

import requests
import json
from typing import Dict, Optional

# Backend URL
BASE_URL = "https://lead-mgmt-app-1.preview.emergentagent.com/api"

# Test credentials
ADMIN_USER = {
    "username": "vsawariya",
    "password": "Welcome@LMS"
}

NON_ADMIN_USER = {
    "username": "shweta",
    "password": "1234"
}

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_test(message: str):
    print(f"\n{Colors.BLUE}[TEST]{Colors.END} {message}")

def print_pass(message: str):
    print(f"{Colors.GREEN}✓ PASS:{Colors.END} {message}")

def print_fail(message: str):
    print(f"{Colors.RED}✗ FAIL:{Colors.END} {message}")

def print_info(message: str):
    print(f"{Colors.YELLOW}ℹ INFO:{Colors.END} {message}")

def login(username: str, password: str) -> Optional[Dict]:
    """Login and return user data with token"""
    print_test(f"Logging in as {username}")
    
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": username, "password": password}
    )
    
    if response.status_code == 200:
        data = response.json()
        # Extract user data from nested structure
        user_data = data.get('user', {})
        user_data['access_token'] = data.get('access_token')
        print_pass(f"Login successful - User ID: {user_data.get('id')}, Role: {user_data.get('role')}")
        return user_data
    else:
        print_fail(f"Login failed - Status: {response.status_code}, Response: {response.text}")
        return None

def is_phone_masked(phone: str) -> bool:
    """Check if phone number is masked (contains X)"""
    return phone and 'X' in phone

def is_phone_full(phone: str) -> bool:
    """Check if phone number is full (no X)"""
    return phone and 'X' not in phone

def test_clients_endpoint(token: str, user_id: int, user_role: str):
    """Test GET /api/leads/clients endpoint for masking"""
    print_test(f"Testing GET /api/leads/clients as {user_role} (ID: {user_id})")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/leads/clients", headers=headers)
    
    if response.status_code != 200:
        print_fail(f"API call failed - Status: {response.status_code}")
        return False
    
    leads = response.json()
    print_info(f"Retrieved {len(leads)} client leads")
    
    if not leads:
        print_info("No leads found to test")
        return True
    
    # Test masking logic
    own_leads = [l for l in leads if l.get('created_by') == user_id]
    other_leads = [l for l in leads if l.get('created_by') != user_id and l.get('created_by') is not None]
    
    print_info(f"Own leads: {len(own_leads)}, Other users' leads: {len(other_leads)}")
    
    all_passed = True
    
    # Check own leads - should NOT be masked
    for lead in own_leads[:3]:  # Check first 3
        phone = lead.get('phone', '')
        if phone:
            if is_phone_full(phone):
                print_pass(f"Own lead '{lead.get('name')}' - Phone NOT masked: {phone}")
            else:
                print_fail(f"Own lead '{lead.get('name')}' - Phone incorrectly masked: {phone}")
                all_passed = False
    
    # Check other users' leads
    if user_role.lower() == 'admin':
        # Admin should see all phones unmasked
        for lead in other_leads[:3]:  # Check first 3
            phone = lead.get('phone', '')
            if phone:
                if is_phone_full(phone):
                    print_pass(f"Admin sees other's lead '{lead.get('name')}' - Phone NOT masked: {phone}")
                else:
                    print_fail(f"Admin should see unmasked phone for '{lead.get('name')}', got: {phone}")
                    all_passed = False
    else:
        # Non-admin should see masked phones for others
        for lead in other_leads[:3]:  # Check first 3
            phone = lead.get('phone', '')
            created_by = lead.get('created_by')
            if phone:
                if is_phone_masked(phone):
                    print_pass(f"Non-admin sees masked phone for '{lead.get('name')}' (created_by={created_by}): {phone}")
                else:
                    print_fail(f"Non-admin should see masked phone for '{lead.get('name')}' (created_by={created_by}), got: {phone}")
                    all_passed = False
    
    return all_passed

def test_inventory_endpoint(token: str, user_id: int, user_role: str):
    """Test GET /api/leads/inventory endpoint for masking"""
    print_test(f"Testing GET /api/leads/inventory as {user_role} (ID: {user_id})")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/leads/inventory", headers=headers)
    
    if response.status_code != 200:
        print_fail(f"API call failed - Status: {response.status_code}")
        return False
    
    leads = response.json()
    print_info(f"Retrieved {len(leads)} inventory leads")
    
    if not leads:
        print_info("No leads found to test")
        return True
    
    # Test masking logic
    own_leads = [l for l in leads if l.get('created_by') == user_id]
    other_leads = [l for l in leads if l.get('created_by') != user_id and l.get('created_by') is not None]
    
    print_info(f"Own leads: {len(own_leads)}, Other users' leads: {len(other_leads)}")
    
    all_passed = True
    
    # Check own leads - should NOT be masked
    for lead in own_leads[:3]:  # Check first 3
        phone = lead.get('phone', '')
        if phone:
            if is_phone_full(phone):
                print_pass(f"Own lead '{lead.get('name')}' - Phone NOT masked: {phone}")
            else:
                print_fail(f"Own lead '{lead.get('name')}' - Phone incorrectly masked: {phone}")
                all_passed = False
    
    # Check other users' leads
    if user_role.lower() == 'admin':
        # Admin should see all phones unmasked
        for lead in other_leads[:3]:  # Check first 3
            phone = lead.get('phone', '')
            if phone:
                if is_phone_full(phone):
                    print_pass(f"Admin sees other's lead '{lead.get('name')}' - Phone NOT masked: {phone}")
                else:
                    print_fail(f"Admin should see unmasked phone for '{lead.get('name')}', got: {phone}")
                    all_passed = False
    else:
        # Non-admin should see masked phones for others
        for lead in other_leads[:3]:  # Check first 3
            phone = lead.get('phone', '')
            created_by = lead.get('created_by')
            if phone:
                if is_phone_masked(phone):
                    print_pass(f"Non-admin sees masked phone for '{lead.get('name')}' (created_by={created_by}): {phone}")
                else:
                    print_fail(f"Non-admin should see masked phone for '{lead.get('name')}' (created_by={created_by}), got: {phone}")
                    all_passed = False
    
    return all_passed

def test_urgent_followups_endpoint(token: str, user_id: int, user_role: str):
    """Test GET /api/ai/urgent-followups endpoint for masking"""
    print_test(f"Testing GET /api/ai/urgent-followups as {user_role} (ID: {user_id})")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/ai/urgent-followups?limit=5", headers=headers)
    
    if response.status_code != 200:
        print_fail(f"API call failed - Status: {response.status_code}")
        return False
    
    followups = response.json()
    print_info(f"Retrieved {len(followups)} urgent followups")
    
    if not followups:
        print_info("No followups found to test")
        return True
    
    all_passed = True
    
    for followup in followups:
        lead_name = followup.get('lead_name', 'Unknown')
        lead_phone = followup.get('lead_phone', '')
        created_by = followup.get('created_by')
        
        if not lead_phone:
            continue
        
        # When created_by is None (legacy data), check masking behavior
        if created_by is None:
            print_info(f"Followup '{lead_name}' has NULL created_by (legacy data)")
            # For NULL created_by: admin should see unmasked, non-admin should see masked
            if user_role.lower() == 'admin':
                if is_phone_full(lead_phone):
                    print_pass(f"Admin sees unmasked phone for NULL created_by lead '{lead_name}': {lead_phone}")
                else:
                    print_fail(f"Admin should see unmasked phone for '{lead_name}', got: {lead_phone}")
                    all_passed = False
            else:
                if is_phone_masked(lead_phone):
                    print_pass(f"Non-admin sees masked phone for NULL created_by lead '{lead_name}': {lead_phone}")
                else:
                    print_fail(f"Non-admin should see masked phone for NULL created_by lead '{lead_name}', got: {lead_phone}")
                    all_passed = False
            continue
        
        is_own = created_by == user_id
        
        if is_own:
            # Own lead - should NOT be masked
            if is_phone_full(lead_phone):
                print_pass(f"Own followup '{lead_name}' - Phone NOT masked: {lead_phone}")
            else:
                print_fail(f"Own followup '{lead_name}' - Phone incorrectly masked: {lead_phone}")
                all_passed = False
        else:
            # Other's lead
            if user_role.lower() == 'admin':
                # Admin should see unmasked
                if is_phone_full(lead_phone):
                    print_pass(f"Admin sees other's followup '{lead_name}' - Phone NOT masked: {lead_phone}")
                else:
                    print_fail(f"Admin should see unmasked phone for '{lead_name}', got: {lead_phone}")
                    all_passed = False
            else:
                # Non-admin should see masked
                if is_phone_masked(lead_phone):
                    print_pass(f"Non-admin sees masked phone for '{lead_name}' (created_by={created_by}): {lead_phone}")
                else:
                    print_fail(f"Non-admin should see masked phone for '{lead_name}' (created_by={created_by}), got: {lead_phone}")
                    all_passed = False
    
    return all_passed

def main():
    print("\n" + "="*80)
    print("PHONE/ADDRESS MASKING SECURITY FEATURE TEST")
    print("="*80)
    
    # Test 1: Login as non-admin user (shweta)
    print("\n" + "="*80)
    print("TEST SUITE 1: NON-ADMIN USER (shweta)")
    print("="*80)
    
    non_admin_data = login(NON_ADMIN_USER['username'], NON_ADMIN_USER['password'])
    if not non_admin_data:
        print_fail("Cannot proceed without non-admin login")
        return
    
    non_admin_token = non_admin_data.get('access_token')
    non_admin_id = non_admin_data.get('id')
    non_admin_role = non_admin_data.get('role', '')
    
    # Test endpoints as non-admin
    clients_pass_non_admin = test_clients_endpoint(non_admin_token, non_admin_id, non_admin_role)
    inventory_pass_non_admin = test_inventory_endpoint(non_admin_token, non_admin_id, non_admin_role)
    followups_pass_non_admin = test_urgent_followups_endpoint(non_admin_token, non_admin_id, non_admin_role)
    
    # Test 2: Login as admin user (vsawariya)
    print("\n" + "="*80)
    print("TEST SUITE 2: ADMIN USER (vsawariya)")
    print("="*80)
    
    admin_data = login(ADMIN_USER['username'], ADMIN_USER['password'])
    if not admin_data:
        print_fail("Cannot proceed without admin login")
        return
    
    admin_token = admin_data.get('access_token')
    admin_id = admin_data.get('id')
    admin_role = admin_data.get('role', '')
    
    # Test endpoints as admin
    clients_pass_admin = test_clients_endpoint(admin_token, admin_id, admin_role)
    inventory_pass_admin = test_inventory_endpoint(admin_token, admin_id, admin_role)
    followups_pass_admin = test_urgent_followups_endpoint(admin_token, admin_id, admin_role)
    
    # Final summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    all_tests = [
        ("Non-admin /api/leads/clients", clients_pass_non_admin),
        ("Non-admin /api/leads/inventory", inventory_pass_non_admin),
        ("Non-admin /api/ai/urgent-followups", followups_pass_non_admin),
        ("Admin /api/leads/clients", clients_pass_admin),
        ("Admin /api/leads/inventory", inventory_pass_admin),
        ("Admin /api/ai/urgent-followups", followups_pass_admin),
    ]
    
    passed = sum(1 for _, result in all_tests if result)
    total = len(all_tests)
    
    for test_name, result in all_tests:
        status = f"{Colors.GREEN}PASS{Colors.END}" if result else f"{Colors.RED}FAIL{Colors.END}"
        print(f"{status} - {test_name}")
    
    print(f"\n{Colors.BLUE}Total: {passed}/{total} tests passed{Colors.END}")
    
    if passed == total:
        print(f"\n{Colors.GREEN}✓ ALL TESTS PASSED - Phone masking security feature is working correctly!{Colors.END}")
    else:
        print(f"\n{Colors.RED}✗ SOME TESTS FAILED - Phone masking has issues that need to be fixed{Colors.END}")

if __name__ == "__main__":
    main()
