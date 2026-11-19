"""Hosted email-policy validation; synthetic settings, no service connections."""

import os
from pathlib import Path
import subprocess
import sys

import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.main import create_app


@pytest.fixture
def startup_settings(monkeypatch):
    # Keep all unrelated startup checks valid, including browser auth when enabled.
    for name, value in {
        "INGRESS_MODE": "edge_secret",
        "ORIGIN_VERIFY_SECRET": SecretStr("synthetic-email-guard-edge-secret-20261027"),
        "ALLOWED_HOSTS": ["api.example.test"],
        "CORS_ORIGINS": ["https://app.example.test"],
        "WEB_APP_ORIGINS": ["https://app.example.test"],
        "WEB_AUTH_ENABLED": False,
    }.items():
        monkeypatch.setattr(settings, name, value)


@pytest.mark.parametrize("environment", ["staging", "production"])
@pytest.mark.parametrize("credential", ["", " \t\n"])
@pytest.mark.parametrize("web_auth", [False, True])
def test_hosted_verification_refuses_missing_credentials(
    monkeypatch, startup_settings, environment, credential, web_auth
):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", True)
    monkeypatch.setattr(settings, "MAIL_PASSWORD", SecretStr(credential))
    monkeypatch.setattr(settings, "WEB_AUTH_ENABLED", web_auth)
    with pytest.raises(RuntimeError, match="requires a nonblank MAIL_PASSWORD"):
        create_app()


@pytest.mark.parametrize("environment,required,credential", [
    ("staging", True, "synthetic-brevo-key"),
    ("production", True, "synthetic-brevo-key"),
    ("staging", False, ""),
    ("production", False, ""),
    ("development", True, ""),
    ("testing", True, ""),
])
def test_configured_hosted_and_local_apps_can_be_created(
    monkeypatch, startup_settings, environment, required, credential
):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", required)
    monkeypatch.setattr(settings, "MAIL_PASSWORD", SecretStr(credential))
    assert create_app().title == settings.APP_NAME


@pytest.mark.parametrize("environment", ["staging", "production"])
@pytest.mark.parametrize("credential", [None, " \t", "synthetic-brevo-key"])
def test_fresh_worker_import_enforces_guard_without_network_or_secret_output(
    tmp_path, environment, credential
):
    backend = Path(__file__).resolve().parents[1]
    env = {
        "PATH": os.environ.get("PATH", ""),
        "PYTHONPATH": str(backend),
        "ENVIRONMENT": environment,
        "SECRET_KEY": "synthetic-email-guard-signing-secret-20261027",
        "FRONTEND_URL": "https://api.example.test/api/v1/auth",
        "DATABASE_URL": "postgresql+asyncpg://test:test@127.0.0.1:9/email_guard_test",
        "RATE_LIMIT_STORAGE_URI": "redis://127.0.0.1:9/0",
        "INGRESS_MODE": "edge_secret",
        "ORIGIN_VERIFY_SECRET": "synthetic-email-guard-edge-secret-20261027",
        "ALLOWED_HOSTS": '["api.example.test"]',
        "CORS_ORIGINS": '["https://app.example.test"]',
        "REQUIRE_EMAIL_VERIFICATION": "true",
        "SENTRY_DSN": "",
    }
    if credential is not None:
        env["MAIL_PASSWORD"] = credential
    # A clean cwd/env avoids loading developer .env files. No database, Redis
    # or provider connection is necessary to accept/reject worker startup.
    code = """
import socket
def no_connection(*args, **kwargs):
    raise AssertionError('Startup validation attempted a network connection')
socket.socket.connect = no_connection
from app.main import app
print('APP_READY')
"""
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=tmp_path, env=env,
        capture_output=True, text=True, timeout=20,
    )
    output = result.stdout + result.stderr
    assert "Startup validation attempted a network connection" not in output
    for secret in (env["SECRET_KEY"], env["ORIGIN_VERIFY_SECRET"], "synthetic-brevo-key"):
        assert secret not in output
    if credential and credential.strip():
        assert result.returncode == 0, output
        assert "APP_READY" in result.stdout
    else:
        assert result.returncode != 0
        assert "requires a nonblank MAIL_PASSWORD" in result.stderr
        assert "APP_READY" not in result.stdout
