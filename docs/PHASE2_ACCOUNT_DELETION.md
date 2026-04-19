# Phase 2: Account Deletion — Change Summary

**Branch:** `fix/account-deletion`
**Merged:** PR #13 (2026-04-19)
**Author:** rishabhrd09
**Status:** Shipped — currently running on staging + production

> Predecessor: [PHASE1_AUTH_HARDENING.md](PHASE1_AUTH_HARDENING.md) (PR #12). For the end-user-facing flow and curl recipes, see the repo-root `CAREKOSH_E2E_VERIFICATION_GUIDE.html` (Phase 5).

---

## Overview

Two things were built on this branch:

1. **Backend:** A two-step, email-confirmed account deletion flow required for Google Play Store compliance.
2. **Mobile:** A Profile screen accessible from the top-right menu, where users can view their account info and request account deletion.

The branch also includes two UX improvements to the profile popup menu: swipe-down-to-dismiss gesture and an updated "About CareKosh" description.

---

## Why This Was Required

### Google Play Store Policy

Google Play Store mandates that any app offering account creation must also provide a mechanism to delete the account and all associated data. Without this, the app submission is rejected. The policy requires:

- An in-app path to request deletion (not just a support email link)
- All user data must be deleted, not just deactivated
- The deletion must be accessible without contacting support

### GDPR / Privacy Compliance

Under GDPR Article 17 ("Right to Erasure"), users have the right to request deletion of their personal data. A compliant deletion means:

- Profile data (name, email, hashed password) is deleted
- All user-generated content (inventory, orders, activity logs) is deleted
- Authentication tokens (refresh tokens) are invalidated and deleted
- No orphaned data remains under any table

---

## Pre-Flight: Cascade Delete Verification

Before writing any code, every table with a `user_id` foreign key was audited. This is not optional — if any FK lacks a cascade rule, a DELETE on the `users` row will fail with a FK constraint violation at the database level.

### Findings

| Model | user_id FK | DB `ondelete` | ORM `cascade` | Safe? |
|---|---|---|---|---|
| Category | yes | `CASCADE` | `all, delete-orphan` | ✅ |
| Item | yes | `CASCADE` | `all, delete-orphan` | ✅ |
| Order | yes | `CASCADE` | `all, delete-orphan` | ✅ |
| OrderItem | via `orders.id` | `CASCADE` (on order_id) | N/A — handled by Order | ✅ |
| ActivityLog | yes | `CASCADE` | `all, delete-orphan` | ✅ |
| RefreshToken | yes | `CASCADE` | `all, delete-orphan` | ✅ |
| AuditLog | yes | `CASCADE` | not in User relationships | ✅ |

**OrderItem** has no direct `user_id` column — it references `orders.id`. The chain is:
`users` deleted → `orders` cascade-deleted → `order_items` cascade-deleted. Both hops have `ondelete="CASCADE"`.

**AuditLog** has no ORM relationship on User, but the DB-level FK has `ondelete="CASCADE"`. When `db.delete(user)` issues the SQL `DELETE FROM users WHERE id = ?`, the database engine handles the AuditLog rows automatically without the ORM needing to know about them.

### Two Layers of Cascade

SQLAlchemy has two distinct cascade systems and they work independently:

**DB-level cascade** (`ondelete="CASCADE"` on `ForeignKey(...)`)
- Enforced by the database engine itself
- Works even if you bypass the ORM and run raw SQL
- What actually prevents FK constraint errors at the DB level
- Example: `ForeignKey("users.id", ondelete="CASCADE")`

**ORM-level cascade** (`cascade="all, delete-orphan"` on `relationship(...)`)
- Enforced by SQLAlchemy's session
- Tells SQLAlchemy to emit `DELETE` statements for child objects when the parent is deleted via the ORM
- Also marks children for deletion in the unit of work before the DB flush
- Example: `categories: Mapped[list["Category"]] = relationship("Category", cascade="all, delete-orphan")`

Having both is the correct pattern: ORM cascade keeps SQLAlchemy's identity map consistent; DB cascade is the safety net if anything bypasses the ORM.

---

## Task 1a: User Model — Deletion Token Fields

**File:** `vitaltrack-backend/app/models/user.py`

Two nullable columns added to `users`, placed next to the existing `password_reset_token` fields for consistency:

```python
# Account Deletion Confirmation
deletion_token: Mapped[Optional[str]] = mapped_column(
    String(255), nullable=True, default=None
)
deletion_token_expires: Mapped[Optional[datetime]] = mapped_column(
    DateTime(timezone=True), nullable=True, default=None
)
```

`deletion_token` stores a **SHA-256 hash** of the raw token — never the raw token itself. `deletion_token_expires` is a UTC timestamp set 24 hours in the future when a deletion is requested. Both are `NULL` at rest (no pending deletion).

---

## Task 1b: Alembic Migration

**File:** `vitaltrack-backend/alembic/versions/20260419_add_account_deletion_token_fields.py`

```
Revision ID: 0005_account_deletion_token
Revises:     0004_version_audit_log
```

```python
def upgrade() -> None:
    op.add_column('users', sa.Column('deletion_token', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('deletion_token_expires', sa.DateTime(timezone=True), nullable=True))

def downgrade() -> None:
    op.drop_column('users', 'deletion_token_expires')
    op.drop_column('users', 'deletion_token')
```

Both columns are `nullable=True` — the migration runs against existing rows without a default value, which means no table rewrite or data backfill is needed. This makes the migration safe on a live database with zero downtime.

### Alembic Revision Chain

```
0001_initial
  └── 0002_add_username
        └── 0003_email_verification
              └── 0004_version_audit_log
                    └── 0005_account_deletion_token  ← this migration
```

---

## Task 1c–1e: Three New Auth Endpoints

**File:** `vitaltrack-backend/app/api/v1/auth.py`

The original single-step `DELETE /auth/me` (which deleted the account immediately) was replaced with a three-endpoint flow.

---

### Endpoint 1: `DELETE /auth/me` — Request Deletion

Replaces the original immediate-delete endpoint. Now it **only sends a confirmation email** — no data is deleted yet.

```
Method:   DELETE
Path:     /api/v1/auth/me
Auth:     Required (Bearer token)
Response: 200 MessageResponse
```

**Logic:**

1. Reject if the account has no email (`400`) — email is required for the confirmation link.
2. Reject if the email service (Brevo) is not configured (`503`) — the flow cannot complete without email.
3. Generate a token pair using `generate_verification_token()`:
   - **Raw token** (`secrets.token_urlsafe(32)`) — 256 bits of URL-safe random data, sent inside the email link.
   - **Hashed token** (`SHA-256(raw_token)`) — stored in the database.
4. Write hashed token + 24-hour expiry to `current_user` and commit.
5. Schedule the confirmation email as a `BackgroundTask`.
6. Return immediately with a "check your email" message.

The account is **not touched** beyond writing the token. The user can still log in and use the app normally.

---

### Endpoint 2: `GET /auth/confirm-delete/{token}` — Confirm Deletion

The user clicks the link in the email. This endpoint is the second and final step.

```
Method:   GET
Path:     /api/v1/auth/confirm-delete/{token}
Auth:     None (token in URL is the credential)
Response: HTML page
```

**Logic:**

1. Hash the incoming raw token: `hashlib.sha256(token.encode()).hexdigest()`.
2. Query `users` for a row where `deletion_token == hash AND deletion_token_expires > now()`.
3. If not found → return HTML error page (`400`). This covers expired links and already-used links.
4. Log `CONFIRMED` (before the delete — forensics record survives even if the commit fails).
5. `await db.delete(user)` — SQLAlchemy emits one DELETE on `users`; DB cascades handle all child tables.
6. `await db.commit()`.
7. Log `COMPLETED`.
8. Return HTML success page.

The endpoint is `include_in_schema=False` so it does not appear in the Swagger/OpenAPI docs. It is a browser-facing page, not an API consumer endpoint.

---

### Endpoint 3: `POST /auth/cancel-delete` — Cancel Deletion

Lets the user change their mind after requesting but before confirming.

```
Method:   POST
Path:     /api/v1/auth/cancel-delete
Auth:     Required (Bearer token)
Response: 200 MessageResponse
```

**Logic:** Nulls out `deletion_token` and `deletion_token_expires`, commits. The pending email link becomes invalid because the token no longer exists in the database.

---

## CS Concept: Token-Based Confirmation Pattern

This pattern is used identically for email verification, password reset, and now account deletion. The design principle is:

> **Never store a secret in plaintext. Store only a one-way hash. Send only the raw value once, over a trusted channel (email).**

```
Server                          User's Email           User's Browser
  │                                  │                       │
  ├─ raw  = token_urlsafe(32) ──────►│                       │
  ├─ hash = SHA-256(raw)             │                       │
  ├─ DB.store(hash, expiry)          │  User clicks link     │
  │                                  │──────────────────────►│
  │                          GET /confirm-delete/{raw}       │
  │◄─────────────────────────────────────────────────────────┤
  ├─ incoming_hash = SHA-256(raw)    │                       │
  ├─ DB.query(hash == incoming_hash) │                       │
  ├─ if match + not expired → delete │                       │
  └─ HTML response ────────────────────────────────────────►│
```

**Why SHA-256 and not bcrypt/argon2?**

Verification tokens have very high entropy (256 bits from `secrets.token_urlsafe(32)`), so brute-force is computationally infeasible regardless of the hash algorithm. SHA-256 is fast and appropriate here — bcrypt/argon2's deliberate slowness is designed for low-entropy secrets like passwords, not 256-bit random tokens.

**Why not store the raw token?**

If the database is compromised, an attacker who reads a raw token can immediately use it to delete an account. With only the hash stored, the raw token (which is in the email) is useless to an attacker who only has DB access.

---

## CS Concept: Background Tasks for Email

```python
background_tasks.add_task(
    send_email_via_api,
    to_email=current_user.email,
    ...
)
```

FastAPI's `BackgroundTask` runs the email function **after the HTTP response is sent**. This means:

- The user gets their `200 OK` in milliseconds, without waiting for the Brevo API call (~200–800ms).
- If the email fails, the token is still in the database — the user can retry by calling `DELETE /auth/me` again.
- The token is committed to the DB **before** the background task runs, so there is no race condition between the DB write and the email send.

This is the same pattern used for verification emails and password reset emails throughout the codebase.

---

## CS Concept: Two-Step Destructive Action

The UX pattern of requiring email confirmation before a destructive action is a standard safeguard for irreversible operations. The goals are:

1. **Prevent accidents** — a misclick or compromised session cannot wipe an account in one step.
2. **Verify identity out-of-band** — even if someone steals the access token (e.g., from device logs), they cannot complete deletion without access to the email inbox.
3. **Provide a revocation window** — the 24-hour TTL gives the legitimate user time to cancel if they didn't initiate the request.

The same principle appears in bank wire transfer confirmations, email address changes, and subscription cancellations.

---

## Task 2a: `authService.requestAccountDeletion()`

**File:** `vitaltrack-mobile/services/auth.ts`

```typescript
async requestAccountDeletion(): Promise<{ message: string }> {
    return api.delete<{ message: string }>('/auth/me');
}

async cancelAccountDeletion(): Promise<{ message: string }> {
    return api.post<{ message: string }>('/auth/cancel-delete');
}
```

Added to the existing `authService` singleton. Uses the project's `ApiClient` which handles Bearer token injection, 401 refresh, and structured error extraction automatically — the profile screen doesn't need to manage any of this.

---

## Task 2b: Profile Screen

**File:** `vitaltrack-mobile/app/profile.tsx` *(new file)*

A new screen in the Expo Router file-based routing system. Creating `app/profile.tsx` automatically registers the `/profile` route — no manual route table needed.

### Route Registration

**File:** `vitaltrack-mobile/app/_layout.tsx`

```tsx
<Stack.Screen
  name="profile"
  options={{
    presentation: 'card',
    animation: 'slide_from_right',
  }}
/>
```

This registers the screen outside of `(tabs)` and `(auth)` groups, meaning it is accessible to authenticated users but is not a tab itself. It is presented as a full-screen card that slides in from the right, which matches the existing pattern for `item/[id]` and `order/create`.

### Auth Guard Interaction

The root `_layout.tsx` has a `useProtectedRoute` hook that redirects unauthenticated users to `/(auth)/login`. When the account deletion completes:

1. The user's JWT is still technically valid for up to 30 minutes.
2. The next API call (items, orders, etc.) returns `401` because the user row no longer exists.
3. The `ApiClient` in `services/api.ts` attempts a token refresh on `401` — this also returns `401` (refresh token row was cascade-deleted with the user).
4. `ApiClient` throws `ApiClientError` with `status: 401`.
5. `useAuthStore.initialize()` detects the 401, calls `tokenStorage.clearTokens()`, sets `isAuthenticated: false`.
6. `useProtectedRoute` fires and calls `router.replace('/(auth)/login')`.

The mobile app self-heals without any explicit logout call from the profile screen.

### User Data

```typescript
const user = useAuthStore((state) => state.user);
// user.name, user.email, user.username — all optional strings per types/index.ts
```

The `User` type has optional `email`, `username`, and `name` because the app supports both email-only and username-only accounts. The profile screen handles all three null cases with fallbacks.

---

## Task 2c: ProfileMenuSheet Improvements

**File:** `vitaltrack-mobile/components/common/ProfileMenuSheet.tsx`

### Fix 1: Swipe-Down to Dismiss

The sheet uses a custom React Native `Modal` (not `@gorhom/bottom-sheet`), so swipe-to-dismiss required a manual `PanResponder` implementation.

```typescript
const translateY = useRef(new Animated.Value(0)).current;

const panResponder = useRef(
    PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
        onPanResponderMove: (_, gs) => {
            if (gs.dy > 0) translateY.setValue(gs.dy);
        },
        onPanResponderRelease: (_, gs) => {
            if (gs.dy > 80) {
                Animated.timing(translateY, { toValue: 600, duration: 200, useNativeDriver: true })
                    .start(() => { translateY.setValue(0); onDismiss(); });
            } else {
                Animated.spring(translateY, { toValue: 0, bounciness: 4, useNativeDriver: true }).start();
            }
        },
    })
).current;
```

**Key design decisions:**

- `onStartShouldSetPanResponder: () => false` — the gesture is NOT claimed on touch-down. This means taps on menu items, the theme toggle, and the logout button are never accidentally blocked.
- `onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5` — the gesture IS claimed once the finger has moved 5px downward. This distinguishes a swipe from a tap with high reliability.
- Only downward movement (`gs.dy > 0`) translates the sheet. Upward drags are ignored.
- **Dismiss threshold: 80px.** Industry standard for bottom sheets is roughly 30–40% of the sheet height. 80px is a conservative, forgiving threshold that avoids accidental dismissal while still feeling responsive.
- After dismissal: `translateY.setValue(0)` resets the animation before `onDismiss()` is called, so the next time the sheet opens it starts at position 0 (not off-screen).
- `useNativeDriver: true` — the translation is computed on the UI thread (not the JS thread), giving 60fps animation even when the JS thread is busy.

The PanResponder is attached only to the **drag handle container**, not the entire sheet. This is intentional — attaching it to the whole sheet would intercept scroll events inside the sheet's `ScrollView` (if one were added later) and break vertical scrolling.

**React Native Gesture System — Why `useRef` for Both**

Both `translateY` and `panResponder` are created inside `useRef`. This is required because:

- `useRef` values persist across re-renders without causing re-renders themselves.
- `Animated.Value` must be the same object reference throughout the component's lifetime — recreating it on each render would reset the animation position.
- `PanResponder.create()` is an expensive operation that binds event handlers. Recreating it on every render would cause subtle gesture recognition bugs and waste CPU.

`useRef(new Animated.Value(0)).current` creates the `Animated.Value` object on every render call but discards it immediately — only the first-render value is actually used by `useRef`. This is a well-known React Native pattern and is safe.

### Fix 2: About CareKosh Subtitle and Alert

- Subtitle updated from `"Version 2.0.0"` to `"Home ICU Inventory Management · v2.0.0"` — gives users context at a glance without needing to tap.
- Alert content in `index.tsx` updated to describe the app's purpose and target users.

---

## End-to-End Deletion Flow

```
1.  User opens app → taps profile avatar (top-right) → ProfileMenuSheet opens
2.  User taps "Edit Profile" → menu closes → Profile screen slides in
3.  Profile screen shows: name, username, email (from useAuthStore)
4.  User taps "Delete My Account" (red button, bottom of screen)
5.  Alert dialog: warning + "Yes, Send Confirmation" / "Cancel"
6.  User taps "Yes, Send Confirmation"
7.  App calls authService.requestAccountDeletion() → DELETE /api/v1/auth/me
8.  Backend: validates email + email service, generates token pair
9.  Backend: stores SHA-256(raw_token) + 24h expiry in DB, commits
10. Backend: schedules confirmation email via BackgroundTask
11. Backend: returns 200 immediately
12. App: shows "Check Your Email" alert → user taps OK → navigates back
13. User opens email → clicks "Confirm Account Deletion" link
14. Browser: GET /api/v1/auth/confirm-delete/{raw_token}
15. Backend: SHA-256 hashes incoming token, queries DB for matching non-expired row
16. Backend: logs CONFIRMED, calls db.delete(user), DB cascades all child tables
17. Backend: commits, logs COMPLETED
18. Browser: displays "Account Deleted" HTML page
19. Mobile: next API call returns 401 → ApiClient refresh attempt → 401 again
20. useAuthStore: clears tokens, sets isAuthenticated = false
21. useProtectedRoute: router.replace('/(auth)/login')
```

---

## Files Changed

### Backend

| File | Change |
|---|---|
| `vitaltrack-backend/app/models/user.py` | Added `deletion_token` and `deletion_token_expires` fields |
| `vitaltrack-backend/alembic/versions/20260419_add_account_deletion_token_fields.py` | New migration — adds two nullable columns to `users` |
| `vitaltrack-backend/app/api/v1/auth.py` | Replaced immediate `delete_account` with `request_account_deletion`; added `confirm_account_deletion` (HTML) and `cancel_account_deletion` endpoints; added `hashlib` import; added `send_email_via_api` to email utils import |

### Mobile

| File | Change |
|---|---|
| `vitaltrack-mobile/services/auth.ts` | Added `requestAccountDeletion()` and `cancelAccountDeletion()` methods |
| `vitaltrack-mobile/app/profile.tsx` | New screen — displays user info, hosts Delete My Account UI |
| `vitaltrack-mobile/app/_layout.tsx` | Registered `profile` Stack.Screen |
| `vitaltrack-mobile/app/(tabs)/index.tsx` | Wired `onEditProfile` → `router.push('/profile')`; updated About alert text |
| `vitaltrack-mobile/components/common/ProfileMenuSheet.tsx` | Added swipe-down PanResponder; added "Edit Profile" menu item; updated About subtitle |

---

## Security Properties

| Property | How It Is Achieved |
|---|---|
| Token never stored in plaintext | SHA-256 hash stored; raw token only ever in the email |
| Token cannot be brute-forced | 256-bit entropy from `secrets.token_urlsafe(32)` |
| Stolen access token cannot delete account alone | Requires access to the user's email inbox (out-of-band) |
| Expired link is rejected | `deletion_token_expires > now()` enforced in the DB query |
| Already-used link is rejected | Deletion of the user row also deletes the token |
| Deletion is auditable | Two `logger.warning()` lines — CONFIRMED (before) and COMPLETED (after) |
| No orphaned data | DB-level `ondelete="CASCADE"` on all child tables, verified in pre-flight |
