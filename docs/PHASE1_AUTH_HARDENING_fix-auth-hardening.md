# Phase 1: Auth Hardening — Change Summary

**Branch:** `fix/auth-hardening`
**Date:** 2026-04-18
**Author:** rishabhrd09
**Status:** Complete — pushed, CI tests green

---

## Overview

Four security improvements to the backend authentication layer. No database migrations, no new dependencies, no mobile changes. All changes are in `vitaltrack-backend/`.

---

## Commits

| Commit | Message | Files |
|---|---|---|
| `ab39901` | fix: harden config validators for production deployment | `app/core/config.py` |
| `6289699` | fix: uniform response for resend-verification (prevent email enumeration) | `app/api/v1/auth.py` |
| `bab181e` | fix: revoke all refresh tokens on password change | `app/api/v1/auth.py`, `app/schemas/user.py` |
| *(test fix)* | test: update register_user helper to always include email (email now required) | `tests/conftest.py`, `tests/test_auth.py` |

---

## Task 1 — Config Hardening

**File:** `vitaltrack-backend/app/core/config.py`

### 1a. SECRET_KEY validator

Added `reject_weak_secret_in_production` field validator.

- In `ENVIRONMENT=production`: rejects any key that starts with `"CHANGE-THIS"` — the app will **refuse to start** rather than run with a default insecure key.
- In all environments: rejects keys shorter than 32 characters.
- `ENVIRONMENT` is defined at line 28 (above `SECRET_KEY` at line 69), so `info.data.get("ENVIRONMENT")` correctly reads the field in pydantic v2.

```python
@field_validator("SECRET_KEY")
@classmethod
def reject_weak_secret_in_production(cls, v, info):
    env = info.data.get("ENVIRONMENT", "development")
    if env == "production" and v.startswith("CHANGE-THIS"):
        raise ValueError(
            "SECRET_KEY must be set to a strong random value in production. "
            'Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"'
        )
    if len(v) < 32:
        raise ValueError("SECRET_KEY must be at least 32 characters")
    return v
```

### 1b. MAIL_FROM default

```python
# Before
MAIL_FROM: str = "noreply@vitaltrack.app"

# After
MAIL_FROM: str = "noreply@carekosh.com"
```

Aligns the code default with the CareKosh rebrand. If `MAIL_FROM` is explicitly set in Render environment variables, the env var takes precedence — this only affects environments where the variable is not set.

### 1c. FRONTEND_URL validator

Changed default to `""` and added `require_frontend_url_in_production` validator.

- In `ENVIRONMENT=production`: rejects an empty value — startup fails rather than sending broken links in emails.
- In all other environments: falls back to `"http://127.0.0.1:8000/api/v1/auth"` (local dev default).

```python
FRONTEND_URL: str = ""

@field_validator("FRONTEND_URL")
@classmethod
def require_frontend_url_in_production(cls, v, info):
    env = info.data.get("ENVIRONMENT", "development")
    if env == "production" and not v:
        raise ValueError("FRONTEND_URL must be set in production")
    return v or "http://127.0.0.1:8000/api/v1/auth"
```

### 1d. APP_NAME

Already `"CareKosh API"` — no change needed.

---

## Task 2 — Fix Email Enumeration Leak in Resend-Verification

**File:** `vitaltrack-backend/app/api/v1/auth.py` — `resend_verification_email` endpoint

The "already verified" branch previously returned a different message from the "not found" branch, allowing an attacker to enumerate which email addresses are registered.

```python
# Before (leaks whether email exists)
if user.is_email_verified:
    return MessageResponse(message="Email is already verified.")

# After (all branches return identical text)
if user.is_email_verified:
    return MessageResponse(
        message="If an account exists with this email, a verification link will be sent."
    )
```

All three branches (not found / already verified / sent) now return the exact same string.

---

## Task 3 — Revoke All Sessions on Password Change

**File:** `vitaltrack-backend/app/api/v1/auth.py` — `change_password` endpoint

Previously, changing a password did not invalidate existing sessions on other devices. An attacker who had stolen a refresh token could continue using it indefinitely after a password change.

Added token revocation between the password hash update and the commit:

```python
current_user.hashed_password = hash_password(data.new_password)

# New: invalidate all refresh tokens for this user
await db.execute(
    update(RefreshToken)
    .where(RefreshToken.user_id == current_user.id)
    .values(is_revoked=True)
)

await db.commit()
```

Updated response message to inform the user:

```python
# Before
return MessageResponse(message="Password changed successfully")

# After
return MessageResponse(message="Password changed successfully. Please log in again on your other devices.")
```

Both `update` (sqlalchemy) and `RefreshToken` were already imported — no new imports needed.

Note: `reset_password` already had this revocation logic before this change. `change_password` was the only endpoint missing it.

---

## Task 4 — Email Required for Registration

**File:** `vitaltrack-backend/app/schemas/user.py` — `UserRegister` schema

### 4a. Login verification check

Already implemented correctly in `auth.py` before this phase — not modified.

The existing check:
```python
if (
    settings.REQUIRE_EMAIL_VERIFICATION
    and settings.MAIL_PASSWORD          # only enforce if email sending is configured
    and user.email                      # don't block username-only users
    and not user.is_email_verified
):
    raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")
```

### 4b. Email made required in UserRegister

**Rationale:** Every Android user has a Gmail (required to install from Play Store). Email is needed for verification, password recovery, account communication, and Play Store compliance (account recovery mechanism required). Username-only accounts have no recovery path and are a support liability.

```python
# Before — email optional, username optional, at least one required
class UserRegister(BaseModel):
    email: Optional[EmailStr] = Field(None, description="Email address (optional if username provided)")
    username: Optional[str] = Field(None, ...)
    ...
    def model_post_init(self, __context) -> None:
        if not self.email and not self.username:
            raise ValueError("Either email or username is required")

# After — email required, username optional
class UserRegister(BaseModel):
    email: EmailStr = Field(..., description="Email address for account verification and recovery")
    username: Optional[str] = Field(None, ...)
    ...
    # model_post_init removed — no longer needed
```

Username remains optional — users may set one for login convenience, but every account must have an email.

---

## Test Fixes

**Files:** `vitaltrack-backend/tests/conftest.py`, `vitaltrack-backend/tests/test_auth.py`

Making email required in `UserRegister` broke all tests that registered users with username only (no email).

### conftest.py — `register_user` helper

Auto-generates an email from the username or name when none is provided:

```python
# Before
payload = {"name": name, "password": password}
if username:
    payload["username"] = username
if email:
    payload["email"] = email

# After
if not email:
    identifier = username or name.lower().replace(" ", "")
    email = f"{identifier}@test.com"
payload = {"name": name, "email": email, "password": password}
if username:
    payload["username"] = username
```

This one change fixes all test classes that call `register_user` with username only (`TestLogin`, `TestTokenLifecycle`, `TestLogout`, `TestPasswordChange`, `TestSessionIsolation`).

### test_auth.py — specific test fixes

| Test | Change |
|---|---|
| `TestRegistrationUsername.test_register_with_username` | `assert email is None` → `assert email == "frank@test.com"` |
| `TestRegistrationErrors.test_duplicate_username_rejected` | Added `"email": "imposter@test.com"` to raw POST (without email → 422 instead of 400, duplicate logic never reached) |
| `TestPasswordValidation` — all 6 tests | Added unique email to each raw POST (invalid-password tests were passing for the wrong reason; valid-password tests were failing with 422) |

---

## Render Environment Variables Required

These variables must be set on the Render dashboard before merging to production. Set staging first, verify smoke tests pass, then set production.

| Variable | Staging | Production |
|---|---|---|
| `ENVIRONMENT` | `staging` | `production` |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` | Different random key |
| `MAIL_FROM` | `noreply@carekosh.com` | `noreply@carekosh.com` |
| `FRONTEND_URL` | `https://vitaltrack-api-staging.onrender.com/api/v1/auth` | `https://vitaltrack-api.onrender.com/api/v1/auth` |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | `true` |
| `MAIL_USERNAME` | Brevo SMTP login | same |
| `MAIL_PASSWORD` | Brevo API key | same |
| `MAIL_SERVER` | `smtp-relay.brevo.com` | same |
| `MAIL_PORT` | `587` | same |
| `MAIL_STARTTLS` | `true` | same |
| `MAIL_SSL_TLS` | `false` | same |

**If Render already has `MAIL_*` vars configured and email was working — no changes needed for those.**
**Check specifically:** `ENVIRONMENT`, `FRONTEND_URL`, and `SECRET_KEY` (ensure it does not start with `"CHANGE-THIS"`).

---

## Staging Smoke Tests

Run after merge + Render redeploy completes:

```bash
S=https://vitaltrack-api-staging.onrender.com/api/v1

# 1. Health
curl -s $S/../health | jq .status
# Expect: "healthy"

# 2. Register
curl -s -X POST $S/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test-phase1@example.com","password":"TestPass123!","name":"Tester"}' | jq .

# 3. Login BEFORE verifying — MUST be 403
curl -s -X POST $S/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test-phase1@example.com","password":"TestPass123!"}' | jq .
# Expect: {"detail":"EMAIL_NOT_VERIFIED"}  — if 200, Task 4a failed

# 4. Check inbox for verification email (Brevo dashboard)

# 5. Resend-verification — BOTH calls must return identical text
curl -s -X POST $S/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{"email":"test-phase1@example.com"}' | jq -r .message

curl -s -X POST $S/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com"}' | jq -r .message
# Both must print: "If an account exists with this email, a verification link will be sent."

# 6. After clicking verification link — login MUST succeed
curl -s -X POST $S/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test-phase1@example.com","password":"TestPass123!"}' | jq .
# Expect: 200 with access_token + refresh_token

# 7. Change password — replace <tokens> with values from step 6
TOKEN=<access_token>
REFRESH=<refresh_token>
curl -s -X POST $S/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"current_password":"TestPass123!","new_password":"NewPass456!"}' | jq .
# Expect: 200 "Please log in again on your other devices."

# 8. Old refresh token MUST be revoked
curl -s -X POST $S/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}" | jq .
# Expect: 401 "Token has been revoked"
```

---

## Files Changed Summary

```
vitaltrack-backend/app/core/config.py      — validators, MAIL_FROM, FRONTEND_URL default
vitaltrack-backend/app/api/v1/auth.py      — enumeration fix, token revocation on password change
vitaltrack-backend/app/schemas/user.py     — email required in UserRegister
vitaltrack-backend/tests/conftest.py       — register_user auto-generates email
vitaltrack-backend/tests/test_auth.py      — 9 test locations updated
```
