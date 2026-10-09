#!/usr/bin/env python3
"""Reproduce the documented CareKosh API examples against a disposable LOCAL test database.

What it does
    Runs the real FastAPI application in-process (HTTPX ASGITransport), sends the
    synthetic requests used in docs/API_TRACEABILITY.md and records each status
    code, a trimmed response and the relevant database rows before and after.

Safety rules (enforced, not optional)
    * DATABASE_URL must point at 127.0.0.1, localhost or ::1 AND the database
      name must contain "test". ENVIRONMENT must be "testing".
    * The schema is DROPPED and rebuilt through Alembic on that database.
    * No email is sent and no AI provider is called: the email helpers and the
      Groq HTTP call are replaced in this process with recorders.
    * Rate limiting is disabled in this process, as in the test suite.
    * All names, emails and passwords are synthetic.

Usage (from vitaltrack-backend/, with the backend dependencies installed):
    DATABASE_URL=postgresql+asyncpg://<user>@127.0.0.1:<port>/<name_with_test> \
    SECRET_KEY=<at least 32 characters> ENVIRONMENT=testing \
    python ../docs/tools/api_walkthrough.py \
        --output ../docs/documentation-audit-2026-10-07/evidence/api-walkthrough.json

This is documentation evidence. It does not replace the backend test suite and it
does not exercise proxies, multiple workers, real email, real Groq or a phone.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parents[2] / "vitaltrack-backend"
sys.path.insert(0, str(BACKEND))

from sqlalchemy.engine import make_url  # noqa: E402


def assert_disposable_target() -> str:
    url = make_url(os.environ.get("DATABASE_URL", ""))
    host = (url.host or "").lower()
    name = (url.database or "").lower()
    if os.environ.get("ENVIRONMENT") != "testing":
        sys.exit("Refusing: set ENVIRONMENT=testing.")
    if host not in {"127.0.0.1", "localhost", "::1"}:
        sys.exit(f"Refusing: database host {host!r} is not local.")
    if "test" not in name:
        sys.exit(f"Refusing: database name {name!r} does not contain 'test'.")
    return f"{host}:{url.port}/{name}"


TARGET = assert_disposable_target()

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from pydantic import SecretStr  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.api import deps  # noqa: E402
from app.api.v1 import auth  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import Base, engine  # noqa: E402
from app.core.logging import redact_message  # noqa: E402
from app.main import app  # noqa: E402
from app.services import ai_provider  # noqa: E402

JWT = re.compile(r"eyJ[\w-]+\.[\w-]+\.[\w-]+")
STEPS: list[dict[str, Any]] = []
EMAILS: list[dict[str, str]] = []
GROQ_CALLS: list[dict[str, Any]] = []
EMAIL_ON = {"value": False}


# --------------------------------------------------------------------------- helpers
def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: ("<redacted token>" if k in {"access_token", "refresh_token", "token"} and v else redact(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return JWT.sub("<redacted jwt>", value)
    return value


def trim(value: Any, limit: int = 1600) -> Any:
    text_value = json.dumps(value, default=str)
    if len(text_value) <= limit:
        return value
    return text_value[:limit] + "…(trimmed)"


async def rows(sql: str, **params: Any) -> list[dict[str, Any]]:
    async with engine.connect() as conn:
        result = await conn.execute(text(sql), params)
        return [dict(r._mapping) for r in result]


async def counts() -> dict[str, int]:
    tables = [
        "users", "refresh_tokens", "categories", "items", "orders", "order_items",
        "order_number_counters", "activity_logs", "audit_log", "ai_consents", "ai_usage",
    ]
    out = {}
    for table in tables:
        out[table] = (await rows(f"SELECT count(*) AS n FROM {table}"))[0]["n"]
    return out


async def checksum(tables: list[str]) -> dict[str, str]:
    out = {}
    for table in tables:
        out[table] = (await rows(f"SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM {table} t"))[0]["h"]
    return out


class Api:
    def __init__(self, client: AsyncClient):
        self.client = client

    async def call(self, scenario: str, step: str, method: str, path: str, *, token: str | None = None,
                   body: Any = None, expect: int | tuple[int, ...] | None = None,
                   db_after: dict[str, str] | None = None, note: str | None = None,
                   raw_headers: dict[str, str] | None = None, content: bytes | None = None):
        headers = dict(raw_headers or {})
        if token:
            headers["Authorization"] = f"Bearer {token}"
        response = await self.client.request(method, path, json=body if content is None else None,
                                             content=content, headers=headers)
        try:
            payload = response.json()
        except ValueError:
            payload = response.text[:600]
        record = {
            "scenario": scenario, "step": step, "request": {"method": method, "path": redact_message(path),
            "body": trim(redact(body))}, "status": response.status_code,
            "response": trim(redact(payload)),
        }
        if note:
            record["note"] = note
        if expect is not None:
            allowed = (expect,) if isinstance(expect, int) else expect
            record["expected"] = list(allowed)
            record["matches_expectation"] = response.status_code in allowed
        if db_after:
            record["db_after"] = {label: [redact(r) for r in await rows(sql)] for label, sql in db_after.items()}
        STEPS.append(record)
        return response, payload


def note_step(scenario: str, step: str, **data: Any) -> None:
    STEPS.append({"scenario": scenario, "step": step, **{k: redact(v) for k, v in data.items()}})


# --------------------------------------------------------------------------- fakes
async def fake_send_verification_email(email: str, username: str, token: str) -> bool:
    EMAILS.append({"kind": "verification", "to": email, "token": token})
    return True


async def fake_send_password_reset_email(email: str, username: str, token: str) -> bool:
    EMAILS.append({"kind": "password_reset", "to": email, "token": token})
    return True


async def fake_password_changed(email: str, username: str) -> bool:
    EMAILS.append({"kind": "password_changed", "to": email, "token": ""})
    return True


async def fake_send_email_via_api(to_email: str, to_name: str, subject: str, html_content: str) -> bool:
    match = re.search(r"/confirm-delete/([A-Za-z0-9_\-]+)", html_content)
    EMAILS.append({"kind": "account_deletion", "to": to_email, "token": match.group(1) if match else ""})
    return True


def latest_token(kind: str) -> str:
    for email in reversed(EMAILS):
        if email["kind"] == kind:
            return email["token"]
    raise RuntimeError(f"no {kind} email recorded")


def install_fakes() -> None:
    auth.send_verification_email = fake_send_verification_email
    auth.send_password_reset_email = fake_send_password_reset_email
    auth.send_password_changed_notification = fake_password_changed
    auth.send_email_via_api = fake_send_email_via_api
    auth.is_email_configured = lambda: EMAIL_ON["value"]
    deps.is_email_configured = lambda: EMAIL_ON["value"]
    app.state.limiter.enabled = False

    async def fake_groq(url: str, headers: dict, **kwargs: Any) -> bytes:
        body = kwargs.get("json", {})
        user_message = json.loads(body["messages"][1]["content"])
        GROQ_CALLS.append({"url": url, "model": body.get("model"), "user_message": user_message,
                           "has_tools": "tools" in body,
                           "strict_schema": body.get("response_format", {}).get("json_schema", {}).get("strict")})
        question = user_message["question"].lower()
        if "fail" in question:
            from fastapi import HTTPException
            raise HTTPException(504, "Voice processing timed out. Please try again or type a basic command.")
        if "make up" in question:
            intent = {"intent": "read_item", "item_query": "oxygen cylinder", "reference": "named", "fields": ["quantity"]}
        elif "delete" in question:
            intent = {"intent": "unsupported_action", "item_query": None, "reference": "none", "fields": []}
        else:
            intent = {"intent": "read_item", "item_query": "nitrile gloves", "reference": "named", "fields": ["quantity", "supplier"]}
        return json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(intent)}}],
                           "usage": {"prompt_tokens": 180, "completion_tokens": 40}}).encode()

    ai_provider.bounded_call = fake_groq


async def reset_schema() -> None:
    def upgrade(connection):
        config = Config(str(BACKEND / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND / "alembic"))
        config.attributes["connection"] = connection
        command.upgrade(config, "head")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        await conn.run_sync(upgrade)


# --------------------------------------------------------------------------- scenarios
async def scenario_auth(api: Api) -> dict[str, str]:
    s = "A. Registration, login, refresh, logout"
    _, reg = await api.call(s, "Register Asha (email + optional username)", "POST", "/api/v1/auth/register",
                            body={"name": "Asha Example", "email": "asha.example@example.com",
                                  "username": "asha_demo", "password": "Synthetic1"}, expect=201,
                            db_after={"users": "SELECT id, email, username, is_email_verified, session_version FROM users",
                                      "refresh_tokens": "SELECT jti, is_revoked FROM refresh_tokens",
                                      "activity_logs": "SELECT action, item_name, details FROM activity_logs"})
    await api.call(s, "Duplicate email is refused", "POST", "/api/v1/auth/register",
                   body={"name": "Asha Again", "email": "ASHA.example@example.com", "password": "Synthetic1"}, expect=400)
    await api.call(s, "Weak password fails validation (422 shape)", "POST", "/api/v1/auth/register",
                   body={"name": "Weak", "email": "weak@example.com", "password": "short"}, expect=422)
    _, login = await api.call(s, "Login with username (identifier is case-insensitive)", "POST", "/api/v1/auth/login",
                              body={"identifier": "ASHA_DEMO", "password": "Synthetic1"}, expect=200,
                              db_after={"refresh_tokens": "SELECT is_revoked, count(*) AS n FROM refresh_tokens GROUP BY is_revoked"})
    await api.call(s, "Wrong password", "POST", "/api/v1/auth/login",
                   body={"identifier": "asha.example@example.com", "password": "Wrong1234"}, expect=401)
    access, refresh = login["access_token"], login["refresh_token"]
    await api.call(s, "Profile with the access token", "GET", "/api/v1/auth/me", token=access, expect=200)
    await api.call(s, "No token", "GET", "/api/v1/auth/me", expect=401)
    _, rotated = await api.call(s, "Refresh rotates the pair", "POST", "/api/v1/auth/refresh",
                                body={"refresh_token": refresh}, expect=200,
                                db_after={"refresh_tokens": "SELECT is_revoked, count(*) AS n FROM refresh_tokens GROUP BY is_revoked ORDER BY is_revoked"})
    await api.call(s, "Replaying the old refresh token is refused", "POST", "/api/v1/auth/refresh",
                   body={"refresh_token": refresh}, expect=401)
    new_access, new_refresh = rotated["access_token"], rotated["refresh_token"]
    # Two simultaneous refreshes with the same token: exactly one may win.
    first, second = await asyncio.gather(
        api.client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh}),
        api.client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh}),
    )
    note_step(s, "Concurrent refresh with the same token", statuses=sorted([first.status_code, second.status_code]),
              expected=[200, 401], matches_expectation=sorted([first.status_code, second.status_code]) == [200, 401])
    winner = first if first.status_code == 200 else second
    pair = winner.json()
    await api.call(s, "Logout revokes the refresh token sent in the body", "POST", "/api/v1/auth/logout",
                   token=pair["access_token"], body={"refresh_token": pair["refresh_token"]}, expect=200,
                   db_after={"activity_logs": "SELECT action FROM activity_logs ORDER BY created_at"})
    await api.call(s, "After logout the same ACCESS token still works until it expires (≤30 min)", "GET",
                   "/api/v1/auth/me", token=pair["access_token"], expect=200,
                   note="Documented limitation: logout does not deny-list access tokens.")
    await api.call(s, "After logout the revoked refresh token is refused", "POST", "/api/v1/auth/refresh",
                   body={"refresh_token": pair["refresh_token"]}, expect=401)
    _, relog = await api.call(s, "Login again", "POST", "/api/v1/auth/login",
                              body={"identifier": "asha.example@example.com", "password": "Synthetic1"}, expect=200)
    return {"access": relog["access_token"], "refresh": relog["refresh_token"], "user_id": reg["user"]["id"],
            "stale_access": new_access}


async def scenario_verification_and_password(api: Api) -> None:
    s = "B. Email verification, password change and reset (email captured in-process, never sent)"
    EMAIL_ON["value"] = True
    settings.REQUIRE_EMAIL_VERIFICATION = True
    _, reg = await api.call(s, "Register Ravi while verification is enforced", "POST", "/api/v1/auth/register",
                            body={"name": "Ravi Example", "email": "ravi.example@example.com", "password": "Synthetic2"},
                            expect=201, note="Registration still returns tokens; the app discards them until verification.")
    await api.call(s, "The registration access token is refused while unverified", "GET", "/api/v1/auth/me",
                   token=reg["access_token"], expect=403)
    await api.call(s, "Login is refused while unverified", "POST", "/api/v1/auth/login",
                   body={"identifier": "ravi.example@example.com", "password": "Synthetic2"}, expect=403)
    token = latest_token("verification")
    await api.call(s, "Verify with the emailed token (JSON route)", "GET", f"/api/v1/auth/verify-email/{token}", expect=200,
                   db_after={"users": "SELECT email, is_email_verified, email_verification_token IS NULL AS token_cleared FROM users WHERE email='ravi.example@example.com'"})
    await api.call(s, "The same verification link cannot be used twice", "GET", f"/api/v1/auth/verify-email/{token}", expect=400)
    _, login = await api.call(s, "Login now succeeds", "POST", "/api/v1/auth/login",
                              body={"identifier": "ravi.example@example.com", "password": "Synthetic2"}, expect=200)
    await api.call(s, "Change password", "POST", "/api/v1/auth/change-password", token=login["access_token"],
                   body={"current_password": "Synthetic2", "new_password": "Synthetic3"}, expect=200,
                   db_after={"users": "SELECT session_version FROM users WHERE email='ravi.example@example.com'",
                             "refresh_tokens": "SELECT r.is_revoked, count(*) AS n FROM refresh_tokens r JOIN users u ON u.id=r.user_id WHERE u.email='ravi.example@example.com' GROUP BY r.is_revoked"})
    await api.call(s, "The old access token is refused immediately (session_version changed)", "GET", "/api/v1/auth/me",
                   token=login["access_token"], expect=401)
    await api.call(s, "Forgot password always answers the same way", "POST", "/api/v1/auth/forgot-password",
                   body={"email": "nobody@example.com"}, expect=200)
    await api.call(s, "Forgot password for Ravi", "POST", "/api/v1/auth/forgot-password",
                   body={"email": "ravi.example@example.com"}, expect=200)
    await api.call(s, "Reset password with the emailed token", "POST", "/api/v1/auth/reset-password",
                   body={"token": latest_token("password_reset"), "new_password": "Synthetic4"}, expect=200,
                   db_after={"users": "SELECT session_version, password_reset_token IS NULL AS token_cleared FROM users WHERE email='ravi.example@example.com'"})
    await api.call(s, "Reset token is single-use", "POST", "/api/v1/auth/reset-password",
                   body={"token": latest_token("password_reset"), "new_password": "Synthetic5"}, expect=400)
    settings.REQUIRE_EMAIL_VERIFICATION = False
    EMAIL_ON["value"] = False


async def scenario_profile(api: Api, user: dict[str, str]) -> None:
    s = "C. Profile updates"
    await api.call(s, "Change name and phone", "PATCH", "/api/v1/auth/me", token=user["access"],
                   body={"name": "Asha E.", "phone": "+91 90000 00000"}, expect=200,
                   db_after={"users": "SELECT name, phone FROM users WHERE username='asha_demo'"})
    await api.call(s, "phone: null is ignored (cannot clear with null)", "PATCH", "/api/v1/auth/me", token=user["access"],
                   body={"phone": None}, expect=200,
                   db_after={"users": "SELECT name, phone FROM users WHERE username='asha_demo'"})
    await api.call(s, "Changing the email is refused (support-only)", "PATCH", "/api/v1/auth/me", token=user["access"],
                   body={"email": "new.address@example.com"}, expect=400)


async def scenario_inventory(api: Api, user: dict[str, str]) -> dict[str, Any]:
    s = "D. Categories, items, explicit null and version conflicts"
    t = user["access"]
    _, cat = await api.call(s, "Create category", "POST", "/api/v1/categories", token=t,
                            body={"name": "Respiratory", "description": "Airway and oxygen supplies"}, expect=201)
    await api.call(s, "Duplicate category name (case-insensitive) is refused", "POST", "/api/v1/categories", token=t,
                   body={"name": "respiratory"}, expect=409)
    _, item = await api.call(s, "Create item", "POST", "/api/v1/items", token=t, expect=201, body={
        "categoryId": cat["id"], "name": "Nitrile gloves", "quantity": 40, "unit": "pairs", "minimumStock": 50,
        "brand": "SafeHands", "supplierName": "City Medical Supplies", "isCritical": True},
        db_after={"items": "SELECT name, quantity, minimum_stock, brand, version FROM items",
                  "audit_log": "SELECT entity_type, action, new_values FROM audit_log",
                  "activity_logs": "SELECT action, item_name, details FROM activity_logs WHERE action='ITEM_CREATE'"})
    _, second = await api.call(s, "Create a second item", "POST", "/api/v1/items", token=t, expect=201, body={
        "categoryId": cat["id"], "name": "Suction catheter 12FR", "quantity": 0, "unit": "pieces", "minimumStock": 10})
    await api.call(s, "Omitted fields stay unchanged; explicit null clears brand", "PUT", f"/api/v1/items/{item['id']}",
                   token=t, body={"brand": None, "version": 1}, expect=200,
                   db_after={"items": f"SELECT name, quantity, brand, supplier_name, version FROM items WHERE id='{item['id']}'"})
    await api.call(s, "Required field null is ignored (quantity stays)", "PUT", f"/api/v1/items/{item['id']}",
                   token=t, body={"quantity": None, "version": 2}, expect=200,
                   db_after={"items": f"SELECT quantity, version FROM items WHERE id='{item['id']}'"})
    await api.call(s, "Stale version is refused with the server's values", "PUT", f"/api/v1/items/{item['id']}",
                   token=t, body={"quantity": 45, "version": 1}, expect=409,
                   db_after={"items": f"SELECT quantity, version FROM items WHERE id='{item['id']}'"})
    first, second_resp = await asyncio.gather(
        api.client.patch(f"/api/v1/items/{item['id']}/stock", json={"quantity": 38, "version": 3},
                         headers={"Authorization": f"Bearer {t}"}),
        api.client.patch(f"/api/v1/items/{item['id']}/stock", json={"quantity": 36, "version": 3},
                         headers={"Authorization": f"Bearer {t}"}),
    )
    statuses = sorted([first.status_code, second_resp.status_code])
    note_step(s, "Two phones save stock with the same version at the same moment", statuses=statuses,
              expected=[200, 409], matches_expectation=statuses == [200, 409],
              db_after=await rows(f"SELECT quantity, version FROM items WHERE id='{item['id']}'"),
              audit=await rows(f"SELECT action, old_values, new_values FROM audit_log WHERE entity_id='{item['id']}' AND action='stock_update'"))
    await api.call(s, "Needs-attention list (low = 0 < qty < minimum; out = qty <= 0)", "GET", "/api/v1/items/needs-attention",
                   token=t, expect=200)
    await api.call(s, "Dashboard stats", "GET", "/api/v1/items/stats", token=t, expect=200)
    await api.call(s, "Another user's item is invisible (404, not 403)", "GET", f"/api/v1/items/{item['id']}",
                   token=user["other_access"], expect=404)
    return {"category": cat, "gloves": item, "catheter": second}


async def scenario_orders(api: Api, user: dict[str, str], inv: dict[str, Any]) -> None:
    s = "E. Orders: idempotency, status, apply, delete, history"
    t = user["access"]
    gloves, catheter = inv["gloves"], inv["catheter"]
    line = lambda item, qty: {"itemId": item["id"], "name": item["name"], "unit": item["unit"], "quantity": qty,
                              "currentStock": item["quantity"], "minimumStock": item["minimumStock"],
                              "categoryName": "Respiratory", "isEssential": True, "notes": "synthetic"}
    body = {"orderId": "CLIENT-SIDE-ID", "localId": "a1b2c3d4-0000-4000-8000-000000000001",
            "items": [line(gloves, 60), line(catheter, 20)], "notes": "Weekly restock"}
    _, order = await api.call(s, "Create order with a submission key (localId)", "POST", "/api/v1/orders", token=t,
                              body=body, expect=201,
                              db_after={"orders": "SELECT order_id, status, total_items, total_units, local_id FROM orders",
                                        "order_number_counters": "SELECT * FROM order_number_counters",
                                        "order_items": "SELECT name, quantity, current_stock FROM order_items ORDER BY name"},
                              note="categoryName, isEssential and notes on lines are accepted but not stored.")
    await api.call(s, "Retry with the same localId returns the SAME order (200, no new row)", "POST", "/api/v1/orders",
                   token=t, body=body, expect=200, db_after={"orders": "SELECT count(*) AS n FROM orders"})
    dup = dict(body, localId="a1b2c3d4-0000-4000-8000-000000000002")
    a, b = await asyncio.gather(
        api.client.post("/api/v1/orders", json=dup, headers={"Authorization": f"Bearer {t}"}),
        api.client.post("/api/v1/orders", json=dup, headers={"Authorization": f"Bearer {t}"}),
    )
    statuses = sorted([a.status_code, b.status_code])
    same_id = a.json().get("id") == b.json().get("id")
    note_step(s, "Two simultaneous submissions with one localId", statuses=statuses, same_order=same_id,
              expected=[200, 201], matches_expectation=statuses == [200, 201] and same_id,
              db_after=await rows("SELECT local_id, count(*) AS n FROM orders GROUP BY local_id ORDER BY local_id"))
    no_key = {k: v for k, v in body.items() if k != "localId"}
    await api.call(s, "Without localId (older app builds) a retry creates a second order", "POST", "/api/v1/orders",
                   token=t, body=no_key, expect=201)
    await api.call(s, "Without localId, again", "POST", "/api/v1/orders", token=t, body=no_key, expect=201,
                   db_after={"orders": "SELECT order_id, local_id FROM orders ORDER BY order_id"})
    oid = order["id"]
    await api.call(s, "Illegal transition pending → stock_updated", "PATCH", f"/api/v1/orders/{oid}/status", token=t,
                   body={"status": "stock_updated"}, expect=400)
    await api.call(s, "pending → ordered", "PATCH", f"/api/v1/orders/{oid}/status", token=t, body={"status": "ordered"}, expect=200)
    await api.call(s, "ordered → received", "PATCH", f"/api/v1/orders/{oid}/status", token=t, body={"status": "received"}, expect=200)
    await api.call(s, "Same status again is a no-op", "PATCH", f"/api/v1/orders/{oid}/status", token=t, body={"status": "received"}, expect=200)
    before = await rows("SELECT name, quantity, version FROM items ORDER BY name")
    await api.call(s, "Apply received order to stock (one transaction)", "POST", f"/api/v1/orders/{oid}/apply", token=t,
                   expect=200, note=f"Items before apply: {before}",
                   db_after={"items": "SELECT name, quantity, version FROM items ORDER BY name",
                             "orders": f"SELECT status, applied_at IS NOT NULL AS applied FROM orders WHERE id='{oid}'",
                             "audit_log": "SELECT entity_type, action, new_values FROM audit_log WHERE action='stock_update' AND new_values ? 'source'"})
    await api.call(s, "Second apply is refused; stock unchanged", "POST", f"/api/v1/orders/{oid}/apply", token=t, expect=400,
                   db_after={"items": "SELECT name, quantity, version FROM items ORDER BY name"})
    await api.call(s, "An applied order cannot be deleted", "DELETE", f"/api/v1/orders/{oid}", token=t, expect=400)
    # Rollback demonstration: a received order whose item was deleted cannot be partially applied.
    _, o2 = await api.call(s, "Create order for gloves + catheter", "POST", "/api/v1/orders", token=t, expect=201,
                           body={"orderId": "X", "localId": "a1b2c3d4-0000-4000-8000-000000000003",
                                 "items": [line(gloves, 5), line(catheter, 5)]})
    await api.call(s, "Mark received", "PATCH", f"/api/v1/orders/{o2['id']}/status", token=t, body={"status": "received"}, expect=200)
    await api.call(s, "Delete the catheter item (order lines keep their snapshot)", "DELETE",
                   f"/api/v1/items/{catheter['id']}", token=t, expect=200)
    before = await rows("SELECT name, quantity, version FROM items ORDER BY name")
    await api.call(s, "Apply now fails with 409 and changes nothing", "POST", f"/api/v1/orders/{o2['id']}/apply", token=t,
                   expect=409, note=f"Items before: {before}",
                   db_after={"items": "SELECT name, quantity, version FROM items ORDER BY name",
                             "orders": f"SELECT status FROM orders WHERE id='{o2['id']}'"})
    await api.call(s, "Historical order still shows the deleted item's snapshot", "GET", f"/api/v1/orders/{oid}", token=t, expect=200)
    await api.call(s, "Decline the stuck order", "PATCH", f"/api/v1/orders/{o2['id']}/status", token=t, body={"status": "declined"}, expect=400,
                   note="received → declined is not an allowed transition; the order stays received.")
    _, o3 = await api.call(s, "Create a pending order to delete", "POST", "/api/v1/orders", token=t, expect=201,
                           body={"orderId": "X", "localId": "a1b2c3d4-0000-4000-8000-000000000004", "items": [line(gloves, 1)]})
    await api.call(s, "Delete pending order", "DELETE", f"/api/v1/orders/{o3['id']}", token=t, expect=200,
                   db_after={"order_number_counters": "SELECT * FROM order_number_counters",
                             "audit_log": "SELECT entity_type, action, old_values FROM audit_log WHERE entity_type='order'"})
    _, o4 = await api.call(s, "Order numbers do not reuse the deleted number", "POST", "/api/v1/orders", token=t, expect=201,
                           body={"orderId": "X", "localId": "a1b2c3d4-0000-4000-8000-000000000005", "items": [line(gloves, 1)]},
                           db_after={"orders": "SELECT order_id, status FROM orders ORDER BY order_id"})
    await api.call(s, "Order list (newest first, paginated)", "GET", "/api/v1/orders?page=1&pageSize=2", token=t, expect=200)
    await api.call(s, "Activity feed", "GET", "/api/v1/activities?limit=8", token=t, expect=200)


async def scenario_assistant(api: Api, user: dict[str, str]) -> None:
    s = "F. Assistant: capabilities, consent, interpretation (Groq replaced by a recorder)"
    t = user["access"]
    business = ["users", "categories", "items", "orders", "order_items", "activity_logs", "audit_log", "order_number_counters"]
    await api.call(s, "Capabilities with AI disabled (default configuration)", "GET", "/api/v1/ai/capabilities", token=t, expect=200)
    await api.call(s, "Accepting consent while AI is disabled is refused and writes nothing", "PUT", "/api/v1/ai/consent", token=t,
                   body={"version": "voice-2026-10-06", "accepted": True, "scopes": ["groq_text"]}, expect=503,
                   db_after={"ai_consents": "SELECT count(*) AS n FROM ai_consents"})
    await api.call(s, "No bearer token: refused before the body is read", "POST", "/api/v1/ai/interpret",
                   body={"question": "How many gloves?"}, expect=401)
    settings.AI_ENABLED = True
    settings.AI_DATA_CONTROLS_REVIEWED = True
    settings.GROQ_API_KEY = SecretStr("synthetic-placeholder-not-a-key")
    await api.call(s, "Capabilities after the server flags are enabled", "GET", "/api/v1/ai/capabilities", token=t, expect=200)
    await api.call(s, "Interpret without consent is refused", "POST", "/api/v1/ai/interpret", token=t,
                   body={"question": "Could you tell me how many nitrile gloves are left and who supplies them?"}, expect=403)
    await api.call(s, "Grant groq_text consent (writes ai_consents)", "PUT", "/api/v1/ai/consent", token=t,
                   body={"version": "voice-2026-10-06", "accepted": True, "scopes": ["groq_text"]}, expect=200,
                   db_after={"ai_consents": "SELECT version, accepted, scopes FROM ai_consents"})
    before = await checksum(business)
    await api.call(s, "Interpret an unfamiliar phrasing", "POST", "/api/v1/ai/interpret", token=t,
                   body={"question": "Could you tell me how many nitrile gloves are left and who supplies them?", "has_previous_item": False},
                   expect=200, db_after={"ai_usage": "SELECT kind, provider, status, reserved_microusd, input_tokens, output_tokens FROM ai_usage"})
    await api.call(s, "A model answer naming an item that is not in the question is rejected", "POST", "/api/v1/ai/interpret", token=t,
                   body={"question": "Please make up something about stock"}, expect=502)
    await api.call(s, "Destructive wording becomes unsupported_action (no tool exists)", "POST", "/api/v1/ai/interpret", token=t,
                   body={"question": "Please delete everything from inventory"}, expect=200)
    await api.call(s, "Provider timeout surfaces as 504; the attempt still counts", "POST", "/api/v1/ai/interpret", token=t,
                   body={"question": "this one will fail"}, expect=504,
                   db_after={"ai_usage": "SELECT kind, status, count(*) AS n FROM ai_usage GROUP BY kind, status ORDER BY status"})
    after = await checksum(business)
    note_step(s, "Business tables unchanged by the assistant flow (row checksums)", unchanged=before == after,
              expected=True, matches_expectation=before == after)
    note_step(s, "What was sent to the (replaced) Groq endpoint", groq_calls=GROQ_CALLS)
    await api.call(s, "Oversized AI JSON body is refused (413)", "POST", "/api/v1/ai/interpret", token=t,
                   body={"question": "x" * 13000}, expect=413)
    await api.call(s, "Withdraw consent (always allowed; writes accepted=false)", "PUT", "/api/v1/ai/consent", token=t,
                   body={"version": "voice-2026-10-06", "accepted": False, "scopes": []}, expect=200,
                   db_after={"ai_consents": "SELECT accepted, scopes FROM ai_consents"})
    settings.AI_ENABLED = False
    settings.AI_DATA_CONTROLS_REVIEWED = False
    settings.GROQ_API_KEY = SecretStr("")


async def scenario_errors(api: Api, user: dict[str, str]) -> None:
    s = "G. Error responses and headers"
    response, _ = await api.call(s, "Validation error body", "POST", "/api/v1/items", token=user["access"],
                                 body={"name": "", "categoryId": "missing"}, expect=422)
    note_step(s, "Headers on a normal (422) response", headers={k: v for k, v in response.headers.items()
              if k.lower() in {"x-request-id", "x-content-type-options", "x-frame-options", "cache-control"}})

    async def boom():
        raise RuntimeError("synthetic failure")

    app.add_api_route("/__walkthrough_probe_500", boom, methods=["GET"])
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://walkthrough") as raw:
        r = await raw.get("/__walkthrough_probe_500", headers={"X-Request-ID": "probe-123"})
    note_step(s, "Unhandled exception → generic 500 (temporary probe route added in this process only)",
              status=r.status_code, body=r.json(),
              headers={k: v for k, v in r.headers.items() if k.lower() in {"x-request-id", "x-content-type-options", "cache-control"}},
              note="Shows whether 500 responses pass through the request-id and security-header middleware.")


async def scenario_account_deletion(api: Api, user: dict[str, str]) -> None:
    s = "H. Account deletion (two steps; email captured in-process)"
    t = user["access"]
    EMAIL_ON["value"] = True
    before = await counts()
    await api.call(s, "Request deletion", "DELETE", "/api/v1/auth/me", token=t, expect=200)
    token = latest_token("account_deletion")
    await api.call(s, "Cancel the request", "POST", "/api/v1/auth/cancel-delete", token=t, expect=200)
    await api.call(s, "The cancelled link is invalid", "GET", f"/api/v1/auth/confirm-delete/{token}", expect=400)
    await api.call(s, "Request deletion again", "DELETE", "/api/v1/auth/me", token=t, expect=200)
    token = latest_token("account_deletion")
    await api.call(s, "Opening the link (GET) only shows a confirmation page", "GET", f"/api/v1/auth/confirm-delete/{token}",
                   expect=200, db_after={"users": "SELECT count(*) AS n FROM users WHERE username='asha_demo'"})
    await api.call(s, "Submitting the form (POST) deletes the account", "POST", f"/api/v1/auth/confirm-delete/{token}", expect=200)
    after = await counts()
    note_step(s, "Row counts before and after (other synthetic accounts remain)", before=before, after=after)
    await api.call(s, "Login after deletion fails", "POST", "/api/v1/auth/login",
                   body={"identifier": "asha_demo", "password": "Synthetic1"}, expect=401)
    EMAIL_ON["value"] = False


def markdown_transcript(report: dict[str, Any]) -> str:
    """Human-readable digest of the JSON evidence (same facts, shorter)."""
    lines = [
        "# API walkthrough transcript (synthetic data)",
        "",
        f"Generated {report['generated_at']} by `docs/tools/api_walkthrough.py` against the disposable database "
        f"`{report['database_target']}` (Python {report['python']}). Steps that differed from the documented "
        f"expectation: **{report['mismatches']}**. Tokens are redacted. Email and Groq calls were replaced "
        "in-process by recorders; nothing left the machine.",
        "",
    ]
    scenario = None
    for step in report["steps"]:
        if step["scenario"] != scenario:
            scenario = step["scenario"]
            lines += ["", f"## {scenario}", "", "| Result | Step | Request | Evidence |", "|---|---|---|---|"]
        if "status" in step and "request" in step:
            ok = "✅" if step.get("matches_expectation", True) else "❌"
            req = step["request"]
            body = json.dumps(req.get("body"), default=str) if req.get("body") is not None else ""
            body = (body[:140] + "…") if len(body) > 140 else body
            response = json.dumps(step.get("response"), default=str)
            response = (response[:220] + "…") if len(response) > 220 else response
            evidence = f"`{response}`"
            if step.get("db_after"):
                db = json.dumps(step["db_after"], default=str)
                evidence += f"<br>DB after: `{(db[:320] + '…') if len(db) > 320 else db}`"
            if step.get("note"):
                evidence += f"<br>{step['note'][:300]}"
            cell = f"`{req['method']} {req['path']}`" + (f"<br>`{body}`" if body else "")
            lines.append(f"| {ok} {step['status']} | {step['step']} | {cell} | {evidence} |".replace("\n", " "))
        else:
            ok = "✅" if step.get("matches_expectation", True) else "❌"
            data = {k: v for k, v in step.items() if k not in {"scenario", "step", "matches_expectation"}}
            text = json.dumps(data, default=str)
            lines.append(f"| {ok} | {step['step']} | (observation) | `{(text[:600] + '…') if len(text) > 600 else text}` |")
    return "\n".join(lines) + "\n"


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    print(f"Disposable target verified: {TARGET}")
    install_fakes()
    await reset_schema()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://walkthrough") as client:
        api = Api(client)
        user = await scenario_auth(api)
        await scenario_verification_and_password(api)
        _, other = await api.call("A. Registration, login, refresh, logout", "Register a second synthetic account (Meera)",
                                  "POST", "/api/v1/auth/register",
                                  body={"name": "Meera Example", "email": "meera.example@example.com", "password": "Synthetic6"}, expect=201)
        user["other_access"] = other["access_token"]
        await scenario_profile(api, user)
        inv = await scenario_inventory(api, user)
        await scenario_orders(api, user, inv)
        await scenario_assistant(api, user)
        await scenario_errors(api, user)
        await scenario_account_deletion(api, user)
    await engine.dispose()
    mismatches = [st for st in STEPS if st.get("matches_expectation") is False]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "database_target": TARGET,
        "python": sys.version.split()[0],
        "steps": STEPS,
        "emails_captured": [{"kind": e["kind"], "to": e["to"]} for e in EMAILS],
        "mismatches": len(mismatches),
    }
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, default=str) + "\n")
    out.with_suffix(".md").write_text(markdown_transcript(report), encoding="utf-8")
    print(f"{len(STEPS)} steps recorded, {len(mismatches)} differed from the documented expectation → {out}")
    for st in mismatches:
        print("  MISMATCH:", st["scenario"], "|", st["step"], "| status", st.get("status", st.get("statuses")))
    return 1 if mismatches else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
