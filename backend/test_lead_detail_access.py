import ast
import re
from pathlib import Path
from typing import Optional


# Load the actual authorization helpers without importing FastAPI/MySQL. This
# keeps the focused security tests runnable in lightweight local environments.
source = Path(__file__).with_name("server.py").read_text()
tree = ast.parse(source)
helper_names = {"mask_phone", "mask_address", "should_mask_data", "apply_lead_masking"}
helper_nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in helper_names]
namespace = {"re": re, "Optional": Optional}
exec(compile(ast.Module(body=helper_nodes, type_ignores=[]), str(Path(__file__)), "exec"), namespace)
apply_lead_masking = namespace["apply_lead_masking"]
should_mask_data = namespace["should_mask_data"]


def lead(**overrides):
    value = {
        "id": 10,
        "created_by": 1,
        "assigned_to": 2,
        "phone": "9876543210",
        "email": "private@example.com",
        "address": "C-10, Green Park",
        "Property_locationUrl": "https://maps.example/private",
    }
    value.update(overrides)
    return value


def test_unauthorized_user_sees_masked_values():
    result = apply_lead_masking(lead(), "user", 3)
    assert result["can_view_sensitive"] is False
    assert result["phone"] != "9876543210"
    assert result["email"] is None
    assert result["Property_locationUrl"] is None


def test_creator_sees_private_values():
    result = apply_lead_masking(lead(), "user", 1)
    assert result["can_view_sensitive"] is True
    assert result["phone"] == "9876543210"


def test_current_assignee_sees_private_values():
    assert should_mask_data("user", 2, 1, 2) is False


def test_admin_sees_private_values():
    assert should_mask_data("admin", 99, 1, 2) is False


def test_approved_requester_sees_private_values():
    result = apply_lead_masking(lead(), "user", 3, "approved")
    assert result["can_view_sensitive"] is True
    assert result["detail_access_status"] == "approved"
    assert result["address"] == "C-10, Green Park"


def test_pending_request_does_not_reveal_values():
    result = apply_lead_masking(lead(), "user", 3, "pending")
    assert result["can_view_sensitive"] is False
    assert result["detail_access_status"] == "pending"


def test_declined_request_does_not_reveal_values():
    result = apply_lead_masking(lead(), "user", 3, "declined")
    assert result["can_view_sensitive"] is False
    assert result["detail_access_status"] == "declined"


def test_revoked_requester_loses_private_values_immediately():
    approved = apply_lead_masking(lead(), "user", 3, "approved")
    revoked = apply_lead_masking(lead(), "user", 3, "declined")
    assert approved["phone"] == "9876543210"
    assert revoked["phone"] != "9876543210"
    assert revoked["Property_locationUrl"] is None


def test_declined_request_can_be_approved_again():
    declined = apply_lead_masking(lead(), "user", 3, "declined")
    reapproved = apply_lead_masking(lead(), "user", 3, "approved")
    assert declined["can_view_sensitive"] is False
    assert reapproved["can_view_sensitive"] is True


def test_access_does_not_change_ownership_rules():
    assert should_mask_data("user", 3, 1, 2) is True
    assert apply_lead_masking(lead(), "user", 3, "approved")["can_view_sensitive"] is True
