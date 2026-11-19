"""Guards for the FastAPI/Starlette and python-jose -> PyJWT upgrade."""

import base64
import json

import jwt
import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, decode_token
from app.main import app
from tests.conftest import register_and_auth

# Minted with python-jose 3.5.0 (HS256) before the switch; synthetic secret.
LEGACY_SECRET = "legacy-python-jose-test-secret-0123456789abcdef"
LEGACY_JOSE_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiI3ZjBjMmE1Mi0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMGMwZGUiLCJleHAiOjQxMDI0NDQ4MDAsImlhdCI6MTc2MTUyMzIwMCwidHlwZSI6InJlZnJlc2giLCJqdGkiOiJsZWdhY3ktam9zZS10b2tlbi0wMDAxIiwic2Vzc2lvbl92ZXJzaW9uIjozfQ."
    "WL5xUZhmscAM-BX3VoodmbGhBp_yem2UELYFtOvHE2s"
)


def test_tokens_issued_by_python_jose_still_decode(monkeypatch):
    # Phones keep 30-day refresh tokens; the library switch must not sign them out.
    monkeypatch.setattr(settings, "SECRET_KEY", SecretStr(LEGACY_SECRET))
    payload = decode_token(LEGACY_JOSE_TOKEN)
    assert payload is not None
    assert (payload.sub, payload.type, payload.jti, payload.session_version) == (
        "7f0c2a52-0000-4000-8000-00000000c0de",
        "refresh",
        "legacy-jose-token-0001",
        3,
    )


# The HS512 token is a deliberately rejected input; its short-key warning is expected.
@pytest.mark.filterwarnings("ignore::jwt.warnings.InsecureKeyLengthWarning")
def test_only_the_configured_hmac_algorithm_is_accepted():
    token = create_access_token("user-1")
    assert decode_token(token) is not None
    _, body, _ = token.split(".")
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode())
    assert decode_token(f"{header.decode().rstrip('=')}.{body}.") is None
    claims = jwt.decode(token, settings.secret_key_value, algorithms=["HS256"])
    other = jwt.encode(claims, settings.secret_key_value, algorithm="HS512")
    assert decode_token(other) is None


async def test_database_commit_finishes_before_the_response_starts(monkeypatch):
    # FastAPI's default "request" scope would run get_db's commit after the
    # response; a failed commit would then reach clients as a success.
    events = []
    real_commit = AsyncSession.commit

    async def commit(self):
        await real_commit(self)
        events.append("commit")

    async def recording_app(scope, receive, send):
        async def send_and_record(message):
            if message["type"] == "http.response.start":
                events.append("response")
            await send(message)

        await app(scope, receive, send_and_record)

    async with AsyncClient(
        transport=ASGITransport(app=recording_app), base_url="http://test"
    ) as client:
        _, headers = await register_and_auth(client, email="commit-order@test.com")
        monkeypatch.setattr(AsyncSession, "commit", commit)
        events.clear()
        response = await client.get("/api/v1/items", headers=headers)

    assert response.status_code == 200
    assert events == ["commit", "response"]
