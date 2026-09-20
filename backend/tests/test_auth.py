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


# --- CAR-24: more ways a caller can fail to authenticate --------------------


@pytest.mark.parametrize(
    "header",
    ["", "Bearer", "Bearer   ", "bearer lowercase-scheme", "Token abc", "Bearer\tabc", "abc"],
)
def test_malformed_or_unexpected_authorization_headers_are_rejected(header):
    with patch("app.auth.supabase") as mock_supabase:
        mock_supabase.auth.get_user.side_effect = Exception("invalid")

        with pytest.raises(HTTPException) as excinfo:
            get_current_user_id(authorization=header)

    assert excinfo.value.status_code == 401


@pytest.mark.parametrize("response", [None, MagicMock(user=None)])
def test_a_token_that_resolves_to_no_user_is_rejected(response):
    with patch("app.auth.supabase") as mock_supabase:
        mock_supabase.auth.get_user.return_value = response

        with pytest.raises(HTTPException) as excinfo:
            get_current_user_id(authorization="Bearer some-token")

    assert excinfo.value.status_code == 401


def test_the_token_is_verified_by_supabase_not_decoded_locally():
    # No local JWT parsing/secret: a forged token can only ever pass if
    # Supabase Auth itself says it is valid.
    with patch("app.auth.supabase") as mock_supabase:
        mock_supabase.auth.get_user.side_effect = Exception("signature invalid")

        with pytest.raises(HTTPException):
            get_current_user_id(authorization="Bearer eyJhbGciOiJub25lIn0.e30.")

    mock_supabase.auth.get_user.assert_called_once()
