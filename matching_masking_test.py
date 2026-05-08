#!/usr/bin/env python3
"""
Test script for phone/address masking in matching-inventory and matching-clients endpoints.
Tests both admin and non-admin user access to verify masking behavior.
"""

import requests
import json
from typing import Dict, Optional

# Backend URL
BASE_URL = "https://lead-mgmt-app-1.preview.emergentagent.com/api"

# Test users
ADMIN_USER = {"username": "vsawariya", "password": "Welcome@LMS"}
NON_ADMIN_USER = {"username": "shweta", "password": "1234"}

def login(username: str, password: str) -> Optional[str]:
    """Login and return JWT token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": username, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get('access_token')
            user_info = data.get('user', {})
            print(f"✅ Login successful: {username} (ID: {user_info.get('id')}, Role: {user_info.get('role')})")
            return token
        else:
            print(f"❌ Login failed for {username}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login error for {username}: {str(e)}")
        return None

def test_matching_inventory(token: str, lead_id: int, user_name: str, user_id: int, is_admin: bool):
    """Test GET /api/leads/{lead_id}/matching-inventory endpoint"""
    print(f"\n{'='*80}")
    print(f"Testing GET /api/leads/{lead_id}/matching-inventory as {user_name}")
    print(f"{'='*80}")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(
            f"{BASE_URL}/leads/{lead_id}/matching-inventory",
            headers=headers,
            timeout=10
        )
        
        if response.status_code != 200:
            print(f"❌ API call failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        matches = data.get('matches', [])
        print(f"✅ API call successful. Found {len(matches)} matching inventory leads.")
        
        if len(matches) == 0:
            print("⚠️  No matches found to test masking behavior.")
            return True
        
        # Check masking behavior
        masked_count = 0
        unmasked_count = 0
        own_leads_count = 0
        other_leads_count = 0
        
        for match in matches[:5]:  # Check first 5 matches
            lead_id_match = match.get('id')
            phone = match.get('phone', '')
            created_by = match.get('created_by')
            created_by_name = match.get('created_by_name', 'Unknown')
            
            is_own_lead = (created_by == user_id)
            is_masked = 'X' in phone if phone else False
            
            if is_own_lead:
                own_leads_count += 1
            else:
                other_leads_count += 1
            
            if is_masked:
                masked_count += 1
            else:
                unmasked_count += 1
            
            print(f"  Lead ID: {lead_id_match}, Created by: {created_by_name} (ID: {created_by}), "
                  f"Phone: {phone}, Masked: {is_masked}, Own: {is_own_lead}")
        
        print(f"\nSummary: {masked_count} masked, {unmasked_count} unmasked, "
              f"{own_leads_count} own leads, {other_leads_count} other leads")
        
        # Verify expected behavior
        if is_admin:
            # Admin should see all phones unmasked
            if masked_count > 0:
                print(f"❌ FAIL: Admin user should see all phones unmasked, but found {masked_count} masked")
                return False
            else:
                print(f"✅ PASS: Admin user correctly sees all phones unmasked")
                return True
        else:
            # Non-admin should see own leads unmasked, others masked
            all_correct = True
            for match in matches[:5]:
                phone = match.get('phone', '')
                created_by = match.get('created_by')
                is_own_lead = (created_by == user_id)
                is_masked = 'X' in phone if phone else False
                
                if is_own_lead and is_masked:
                    print(f"❌ FAIL: Own lead (ID: {match.get('id')}) should be unmasked but is masked")
                    all_correct = False
                elif not is_own_lead and not is_masked and phone:
                    print(f"❌ FAIL: Other's lead (ID: {match.get('id')}, created_by: {created_by}) should be masked but is unmasked")
                    all_correct = False
            
            if all_correct:
                print(f"✅ PASS: Non-admin user correctly sees own leads unmasked and others masked")
                return True
            else:
                return False
                
    except Exception as e:
        print(f"❌ Test error: {str(e)}")
        return False

def test_matching_clients(token: str, lead_id: int, user_name: str, user_id: int, is_admin: bool):
    """Test GET /api/leads/{lead_id}/matching-clients endpoint"""
    print(f"\n{'='*80}")
    print(f"Testing GET /api/leads/{lead_id}/matching-clients as {user_name}")
    print(f"{'='*80}")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(
            f"{BASE_URL}/leads/{lead_id}/matching-clients",
            headers=headers,
            timeout=10
        )
        
        if response.status_code != 200:
            print(f"❌ API call failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        matches = data.get('matches', [])
        print(f"✅ API call successful. Found {len(matches)} matching client leads.")
        
        if len(matches) == 0:
            print("⚠️  No matches found to test masking behavior.")
            return True
        
        # Check masking behavior
        masked_count = 0
        unmasked_count = 0
        own_leads_count = 0
        other_leads_count = 0
        
        for match in matches[:5]:  # Check first 5 matches
            lead_id_match = match.get('id')
            phone = match.get('phone', '')
            created_by = match.get('created_by')
            created_by_name = match.get('created_by_name', 'Unknown')
            
            is_own_lead = (created_by == user_id)
            is_masked = 'X' in phone if phone else False
            
            if is_own_lead:
                own_leads_count += 1
            else:
                other_leads_count += 1
            
            if is_masked:
                masked_count += 1
            else:
                unmasked_count += 1
            
            print(f"  Lead ID: {lead_id_match}, Created by: {created_by_name} (ID: {created_by}), "
                  f"Phone: {phone}, Masked: {is_masked}, Own: {is_own_lead}")
        
        print(f"\nSummary: {masked_count} masked, {unmasked_count} unmasked, "
              f"{own_leads_count} own leads, {other_leads_count} other leads")
        
        # Verify expected behavior
        if is_admin:
            # Admin should see all phones unmasked
            if masked_count > 0:
                print(f"❌ FAIL: Admin user should see all phones unmasked, but found {masked_count} masked")
                return False
            else:
                print(f"✅ PASS: Admin user correctly sees all phones unmasked")
                return True
        else:
            # Non-admin should see own leads unmasked, others masked
            all_correct = True
            for match in matches[:5]:
                phone = match.get('phone', '')
                created_by = match.get('created_by')
                is_own_lead = (created_by == user_id)
                is_masked = 'X' in phone if phone else False
                
                if is_own_lead and is_masked:
                    print(f"❌ FAIL: Own lead (ID: {match.get('id')}) should be unmasked but is masked")
                    all_correct = False
                elif not is_own_lead and not is_masked and phone:
                    print(f"❌ FAIL: Other's lead (ID: {match.get('id')}, created_by: {created_by}) should be masked but is unmasked")
                    all_correct = False
            
            if all_correct:
                print(f"✅ PASS: Non-admin user correctly sees own leads unmasked and others masked")
                return True
            else:
                return False
                
    except Exception as e:
        print(f"❌ Test error: {str(e)}")
        return False

def find_inventory_lead(token: str) -> Optional[int]:
    """Find an inventory lead ID for testing matching-clients"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(
            f"{BASE_URL}/leads/inventory",
            headers=headers,
            params={"limit": 10},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            # The response is a list of leads directly
            if isinstance(data, list) and len(data) > 0:
                lead_id = data[0].get('id')
                print(f"Found inventory lead ID: {lead_id}")
                return lead_id
            # Or it might be wrapped in a 'leads' key
            elif isinstance(data, dict):
                leads = data.get('leads', [])
                if leads and len(leads) > 0:
                    lead_id = leads[0].get('id')
                    print(f"Found inventory lead ID: {lead_id}")
                    return lead_id
        return None
    except Exception as e:
        print(f"Error finding inventory lead: {str(e)}")
        return None

def main():
    print("="*80)
    print("PHONE/ADDRESS MASKING TEST - MATCHING ENDPOINTS")
    print("="*80)
    
    results = []
    
    # Test 1: Non-admin user - matching-inventory
    print("\n" + "="*80)
    print("TEST 1: Non-admin user (shweta) - matching-inventory endpoint")
    print("="*80)
    non_admin_token = login(NON_ADMIN_USER['username'], NON_ADMIN_USER['password'])
    if non_admin_token:
        result = test_matching_inventory(non_admin_token, 1216, "shweta", 2, False)
        results.append(("Non-admin matching-inventory", result))
    else:
        results.append(("Non-admin matching-inventory", False))
    
    # Test 2: Admin user - matching-inventory
    print("\n" + "="*80)
    print("TEST 2: Admin user (vsawariya) - matching-inventory endpoint")
    print("="*80)
    admin_token = login(ADMIN_USER['username'], ADMIN_USER['password'])
    if admin_token:
        result = test_matching_inventory(admin_token, 1216, "vsawariya", 1, True)
        results.append(("Admin matching-inventory", result))
    else:
        results.append(("Admin matching-inventory", False))
    
    # Test 3: Find an inventory lead for matching-clients test
    inventory_lead_id = None
    if admin_token:
        inventory_lead_id = find_inventory_lead(admin_token)
    
    if inventory_lead_id:
        # Test 4: Non-admin user - matching-clients
        print("\n" + "="*80)
        print("TEST 3: Non-admin user (shweta) - matching-clients endpoint")
        print("="*80)
        if non_admin_token:
            result = test_matching_clients(non_admin_token, inventory_lead_id, "shweta", 2, False)
            results.append(("Non-admin matching-clients", result))
        else:
            results.append(("Non-admin matching-clients", False))
        
        # Test 5: Admin user - matching-clients
        print("\n" + "="*80)
        print("TEST 4: Admin user (vsawariya) - matching-clients endpoint")
        print("="*80)
        if admin_token:
            result = test_matching_clients(admin_token, inventory_lead_id, "vsawariya", 1, True)
            results.append(("Admin matching-clients", result))
        else:
            results.append(("Admin matching-clients", False))
    else:
        print("\n⚠️  Could not find inventory lead for matching-clients test")
    
    # Print final summary
    print("\n" + "="*80)
    print("FINAL TEST SUMMARY")
    print("="*80)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Phone/address masking is working correctly in matching endpoints.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.")
        return 1

if __name__ == "__main__":
    exit(main())
