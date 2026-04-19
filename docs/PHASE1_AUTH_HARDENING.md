# Phase 1: Auth Hardening — Change Summary

**Branch:** `fix/auth-hardening`
**Merged:** PR #12 (2026-04-18)
**Author:** rishabhrd09
**Status:** Shipped — currently running on staging + production

---

## Overview

Four security improvements to the backend authentication layer. No database migrations, no new dependencies, no mobile changes. All changes are in `vitaltrack-backend/`.

> For the follow-up phase (account deletion + Profile screen), see [PHASE2_ACCOUNT_DELETION.md](PHASE2_ACCOUNT_DELETION.md). For end-to-end auth flow, see [EMAIL_VERIFICATION_GUIDE.md](EMAIL_VERIFICATION_GUIDE.md) and [../CAREKOSH_DEVELOPER_GUIDE.md §10](../CAREKOSH_DEVELOPER_GUIDE.md#10-auth-system).

---

## Commits

| Commit | Message | Files |
|---|---|---|
| `ab39901` | fix: harden config validators for production deployment | `app/core/config.py` |
| `6289699` | fix: uniform response for resend-verification (prevent email enumeration) | `app/api/v1/auth.py` |
| `bab181e` | fix: revoke all refresh tokens on password change | `app/api/v1/auth.py`, `app/schemas/user.py` |
| *(test fix)* | test: update register_user helper to always include email (email now required) | `tests/conftest.py`, `tests/test_auth.py` |

---

## Task 1 — Config hardening

**File:** `vitaltrack-backend/app/core/config.py`

### 1a. SECRET_KEY validator

Added `reject_weak_secret_in_production` field validator.

- In `ENVIRONMENT=production`: rejects any key that starts with `"CHANGE-THIS"` — the app **refuses to start** rather than run with an insecure default.
- In all environments: rejects keys shorter than 32 characters.
- `ENVIRONMENT` is defined before `SECRET_KEY`, so `info.data.get("ENVIRONMENT")` reads the correct value in pydantic v2.

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

Aligns the code default with the CareKosh rebrand (PRs #10–#11). If `MAIL_FROM` is explicitly set in Render env vars, the env var wins — this only affects environments where the variable is unset.

### 1c. FRONTEND_URL validator

Changed default to `""` and added `require_frontend_url_in_production` validator.

- In production: rejects empty — startup fails rather than sending broken links in emails.
- Elsewhere: falls back to `"http://127.0.0.1:8000/api/v1/auth"` (local dev default).

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

### 1d. CORS_ORIGINS validator (shipped alongside, documented here for completeness)

Rejects `"*"` in production; parses JSON or comma-separated lists otherwise.

### 1e. APP_NAME

Already `"CareKosh API"` — no change needed.

---

## Task 2 — Fix email enumeration leak in resend-verification

**File:** `vitaltrack-backend/app/api/v1/auth.py` — `resend_verification_email` endpoint

The "already verified" branch previously returned a different message from the "not found" branch, allowing an attacker to enumerate which emails are registered.

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

All three branches (not-found / already-verified / sent) now return the exact same string.

---

## Task 3 — Revoke all sessions on password change

**File:** `vitaltrack-backend/app/api/v1/auth.py` — `change_password` endpoint

Previously, changing a password did not invalidate existing sessions on other devices. An attacker with a stolen refresh token could continue using it indefinitely after the user changed their password.

Added token revocation between the password hash update and the commit:

```python
current_user.hashed_password = hash_password(data.new_password)

# NEW: invalidate all refresh tokens for this user
await db.execute(
    update(RefreshToken)
    .where(RefreshToken.user_id == current_user.id)
    .values(is_revoked=True)
)

await db.commit()
```

Response copy:

```python
return MessageResponse(
    message="Password changed successfully. Please log in again on your other devices."
)
```

`reset_password` already had this revocation logic before this change — `change_password` was the only endpoint missing it.

---

## Task 4 — Email required for registration

**File:** `vitaltrack-backend/app/schemas/user.py` — `UserRegister` schema

### 4a. Login verification check (pre-existing — not modified)

```python
if (
    settings.REQUIRE_EMAIL_VERIFICATION
    and settings.MAIL_PASSWORD          # only enforce if email sending is configured
    and user.email                      # don't block username-only users
    and not user.is_email_verified
):
    raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")
```

### 4b. Email made required

**Rationale:** Every Android user has a Google account (required to install from Play Store). Email is needed for verification, password recovery, account communication, and Play Store compliance (account-recovery mechanism required). Username-only accounts have no recovery path and become a support liability.

```python
# Before — email optional, username optional, at least one required
class UserRegister(BaseModel):
    email: Optional[EmailStr] = Field(None, ...)
    username: Optional[str] = Field(None, ...)

    def model_post_init(self, __context) -> None:
        if not self.email and not self.username:
            raise ValueError("Either email or username is required")

# After — email required, username optional
class UserRegister(BaseModel):
    email: EmailStr = Field(..., description="Email address for account verification and recovery")
    username: Optional[str] = Field(None, ...)
    # model_post_init removed — no longer needed
```

Username remains optional — users may set one for login convenience — but every account must have an email.

---

## Test fixes

**Files:** `vitaltrack-backend/tests/conftest.py`, `vitaltrack-backend/tests/test_auth.py`

Making email required broke tests that registered users without email. The fix is a one-line change to the `register_user` helper — it auto-generates a test email when none is provided:

```python
if not email:
    identifier = username or name.lower().replace(" ", "")
    email = f"{identifier}@test.com"
payload = {"name": name, "email": email, "password": password}
if username:
    payload["username"] = username
```

This cascades through `TestLogin`, `TestTokenLifecycle`, `TestLogout`, `TestPasswordChange`, and `TestSessionIsolation`.

Specific updates in `test_auth.py`:

| Test | Change |
|---|---|
| `TestRegistrationUsername.test_register_with_username` | `assert email is None` → `assert email == "frank@test.com"` |
| `TestRegistrationErrors.test_duplicate_username_rejected` | Added `"email": "imposter@test.com"` to raw POST (without email → 422 masked the duplicate logic) |
| `TestPasswordValidation` × 6 | Added unique email to each raw POST |

> As of 2026-04-19, the test suite reports 40/53 failing overall. The failures are schema drift unrelated to these changes — see [../CAREKOSH_ROADMAP.md](../CAREKOSH_ROADMAP.md).

---

## Render environment variables required

Set on both Render services before merging to production. Set staging first, verify smoke tests pass, then set production.

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

If Render already had `MAIL_*` vars configured and email was working — no changes for those. **Check specifically:** `ENVIRONMENT`, `FRONTEND_URL`, and that `SECRET_KEY` does not start with `"CHANGE-THIS"`.

---

## Staging smoke tests

Run after merge + Render redeploy completes:

```bash
S=https://vitaltrack-api-staging.onrender.com/api/v1

# 1. Health
curl -s ${S%/api/v1}/health | jq .status
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
# Both must print:
#   "If an account exists with this email, a verification link will be sent."

# 6. After clicking verification link — login MUST succeed
curl -s -X POST $S/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test-phase1@example.com","password":"TestPass123!"}' | jq .

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

## Files changed

```
vitaltrack-backend/app/core/config.py      — validators, MAIL_FROM, FRONTEND_URL default
vitaltrack-backend/app/api/v1/auth.py      — enumeration fix, token revocation on password change
vitaltrack-backend/app/schemas/user.py     — email required in UserRegister
vitaltrack-backend/tests/conftest.py       — register_user auto-generates email
vitaltrack-backend/tests/test_auth.py      — 9 test locations updated
```

---

*Retrospective of PR #12 · written 2026-04-18 · still accurate as of 2026-04-19.*
