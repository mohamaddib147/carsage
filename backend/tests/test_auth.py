# Tests the get_current_user_id dependency: a valid token returns the
# user id, and missing/malformed/invalid-or-expired tokens all raise a
# clean 401 rather than leaking Supabase's raw error.

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.auth import get_current_user_id


def test_returns_the_user_id_for_a_valid_token():
    mock_user_response = MagicMock()
    mock_user_response.user.id = "user-123"

    with patch("app.auth.supabase") as mock_supabase:
        mock_supabase.auth.get_user.return_value = mock_user_response

        user_id = get_current_user_id(authorization="Bearer a-valid-token")

    assert user_id == "user-123"
    mock_supabase.auth.get_user.assert_called_once_with("a-valid-token")


def test_raises_401_when_the_authorization_header_is_missing():
    with pytest.raises(HTTPException) as excinfo:
        get_current_user_id(authorization=None)

    assert excinfo.value.status_code == 401


def test_raises_401_when_the_header_does_not_start_with_bearer():
    with pytest.raises(HTTPException) as excinfo:
        get_current_user_id(authorization="Basic sometoken")

    assert excinfo.value.status_code == 401


def test_raises_401_for_an_invalid_or_expired_token_without_leaking_detail():
    with patch("app.auth.supabase") as mock_supabase:
        mock_supabase.auth.get_user.side_effect = Exception(
            "jwt malformed: internal-secret-detail"
        )

        with pytest.raises(HTTPException) as excinfo:
            get_current_user_id(authorization="Bearer garbage")

    assert excinfo.value.status_code == 401
    assert "internal-secret-detail" not in excinfo.value.detail
