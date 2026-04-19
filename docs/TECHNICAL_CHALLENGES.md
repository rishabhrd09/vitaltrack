# Technical Challenges & Solutions

> **Lessons learned** during CareKosh (formerly VitalTrack) development. A debugging reference for future-us hitting the same wall.

Entries are in rough chronological order. The "Architecture Decisions" section at the bottom captures rationale for choices that are still live.

> **Heads-up on historical entries:** challenges 1–3, 7, 8, 15, 17 describe problems from the **offline-first era** (pre-PR #8). The server-first refactor in PR #8 removed the offline-first architecture — CareKosh is now a React Query + Zustand-UI-only app, not a Zustand-persist + AsyncStorage + custom sync app. Those entries stay here because the root-cause reasoning is still educational.

---

## Challenge 1: Critical Items Not Showing Emergency Backup

### Symptom
BiPAP machine with `qty=1` showed as "Normal" instead of "Low Stock" + "Emergency Backup Required".

### Root Cause
Original logic only checked if quantity was below minimum:
```typescript
// BROKEN: 1 < 1 = false, so BiPAP with qty=1, minStock=1 was "normal"
const isLowStock = (item) => item.quantity < item.minimumStock;
```

### Solution
Critical items with only 1 unit MUST be flagged as low stock:
```typescript
// FIXED: types/index.ts
export const isLowStock = (item: Item): boolean => {
  if (item.quantity <= 0) return false;  // Out of stock, not low

  // Critical equipment with only 1 unit = ALWAYS low stock
  if (isCriticalEquipment(item) && item.quantity === 1) {
    return true;
  }

  if (item.quantity < item.minimumStock) {
    return true;
  }

  return false;
};
```

### Files Changed
- `vitaltrack-mobile/types/index.ts`

---

## Challenge 2 (historical, offline-first era): Activity Logs Disappearing After Login

### Symptom
User makes changes → logs out → logs back in → Activity logs empty.

### Root Cause
`loadUserData()` reset `activityLogs` to `[]` on every login without restoring the per-user persisted copy.

### Solution
Persist logs per user key in AsyncStorage, and load the saved copy **before** clearing in-memory state.

### Files Changed
- `vitaltrack-mobile/store/useAppStore.ts`

### Status
Obsolete after PR #8. Activity logs are now server-side; the client reads them via React Query and never mutates a persisted local copy.

---

## Challenge 3 (historical): Emergency Backup Missing Out-of-Stock Items

### Symptom
Emergency Backup section only showed critical items at `qty=1`, not `qty=0`.

### Root Cause
Only filtering from `lowStockItems`, which excludes `qty=0` items.

### Solution
Combine low-stock + out-of-stock critical items:
```typescript
const lowStockEmergencyItems = lowStockItems.filter(needsEmergencyBackup);
const outOfStockCriticalItems = outOfStockItems.filter(isCriticalEquipment);
const emergencyBackupItems = [...lowStockEmergencyItems, ...outOfStockCriticalItems];
```

### Files Changed
- `vitaltrack-mobile/components/dashboard/NeedsAttention.tsx`

---

## Challenge 4: Phone Can't Connect to Backend (Wi-Fi)

### Symptoms
- "Network request failed" in app
- Phone browser times out against PC IP

### Root Causes (likelihood order)
1. Windows Firewall blocking port 8000
2. Wrong IP in `.env`
3. Phone on a different Wi-Fi network (guest SSID, AP isolation)
4. Backend not running

### Solution
See `docs/LOCAL_TESTING_COMPLETE_GUIDE.md` §E. Fast Windows fix:
```powershell
netsh advfirewall firewall add rule name="FastAPI Dev" dir=in action=allow protocol=tcp localport=8000
```

Fallback: USB + `adb reverse` — see `docs/USB_ADB_REVERSE_GUIDE.md`. Bypasses the network entirely.

---

## Challenge 5: Docker Database Won't Start

### Symptom
```
Error: port 5432 already in use
```

### Root Cause
A local PostgreSQL service is bound to the same port.

### Solution

**Windows:**
```cmd
net stop postgresql-x64-16
```

**macOS:**
```bash
brew services stop postgresql
```

**Alternative:** remap the external port in `docker-compose.dev.yml`:
```yaml
ports:
  - "5433:5432"
```

---

## Challenge 6: Expo Cache Serves Stale Code

### Symptom
`.env` or code changes don't show up in the app.

### Root Cause
Metro bundler caches aggressively.

### Solution
Always use `--clear` after `.env` changes:
```bash
npx expo start --clear
```

Stubborn case:
```bash
rm -rf node_modules .expo
npm install --legacy-peer-deps
npx expo start --clear
```

---

## Challenge 7 (historical, offline-first era): Sync Data Loss on Logout

### Symptom
User makes changes → logs out → changes lost.

### Root Cause
Logout cleared local state before pushing changes to the backend.

### Solution at the time
Sync-before-logout pattern:
```typescript
await get().syncToBackend();
await get().clearStore();
```

### Status
Obsolete after PR #8. Every mutation now flushes to the server immediately via `useServerMutations`, so logout has nothing pending to sync.

---

## Challenge 8 (historical): API Schema Mismatch

### Symptom
Sync operations failing with validation errors.

### Root Cause
Frontend used camelCase; backend expected snake_case.

### Solution
Pydantic aliases for bidirectional mapping:
```python
class SyncOperation(BaseModel):
    entity_id: str = Field(..., alias="entityId")
    local_id: str = Field(..., alias="localId")
    model_config = {"populate_by_name": True}
```

### Status
The legacy `/sync/*` endpoints still exist in `app/api/v1/sync.py` but are unused by the current mobile app. Main REST endpoints (items, orders, categories) use snake_case on the wire.

---

## Challenge 9: Expo Go "Unable to Download Remote Update" (SDK 54)

### Symptom
App loads in Expo Go but immediately crashes with *"Something went wrong. Fatal error: failed to download remote update"*.

### Root Cause
`expo-updates` is installed as a dependency, but no `updates` configuration exists in `app.json`. Expo Go tries to fetch OTA updates on launch, finds nothing configured, and crashes before the app can render.

### Solution
Disable OTA in `app.json`:
```json
{
  "expo": {
    "updates": { "enabled": false }
  }
}
```

### Files Changed
- `vitaltrack-mobile/app.json`

---

## Challenge 10: ADB Reverse Port Mapping Corruption

### Symptom
App loads, UI renders, but every API call returns **404**. Login/register fail with `[API] Status: 404`.

### Root Cause
`adb reverse` had the wrong mapping:
```
tcp:8000 → tcp:8081   WRONG — backend port mapped to Metro bundler
tcp:8081 → tcp:8081   correct
```
Phone port 8000 was routing to Metro (8081) — Metro's HTTP server returned 404 for every API path.

### Diagnose
```bash
adb reverse --list
```

### Fix
```bash
adb reverse --remove-all
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
adb reverse --list
```

### Prevention
Always `adb reverse --remove-all` before setting up new mappings.

---

## Challenge 11: Expo Go Auto-Update Uninstalls Itself (phone storage full)

### Symptom
Pressing `a` in Expo terminal → "Install the recommended Expo Go version?" → Accept → old Expo Go uninstalled → new install fails with `java.io.IOException: not enough space`. Phone now has no Expo Go at all.

### Root Cause
Expo CLI auto-detected a minor version mismatch, uninstalled first, then failed to reinstall due to full storage.

### Solution
1. Free storage.
2. Reinstall Expo Go from Play Store.
3. When Expo offers the auto-update, decline — minor patches within the same SDK (54.x) are compatible.

---

## Challenge 12: Windows Firewall Blocks Phone-to-PC

### Symptom
Phone browser can't reach `http://192.168.x.x:8000/health`. Same Wi-Fi confirmed.

### Solution (Run PowerShell as Admin)
```powershell
New-NetFirewallRule -DisplayName "CareKosh Backend 8000" -Direction Inbound -Port 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Port 8081 -Protocol TCP -Action Allow
```

### Alternative
USB + `adb reverse` — see Challenge 10 and `docs/USB_ADB_REVERSE_GUIDE.md`.

---

## Challenge 13: Ngrok Tunnel Service Down

### Symptom
`npx expo start --tunnel` fails with `CommandError: failed to start tunnel — remote gone away`.

### Root Cause
Ngrok's relay was in outage. Tunnel mode routes through Ngrok.

### Solution
Use LAN (`--lan`) or USB + `adb reverse` (`--localhost`) instead.

| Mode | Command | When |
|------|---------|------|
| LAN | `npx expo start --lan` | Same Wi-Fi, no firewall issues |
| Localhost + USB | `npx expo start --localhost` | Wi-Fi blocked, cable available |
| Tunnel | `npx expo start --tunnel` | Different networks, no cable |

---

## Challenge 14: Rate Limiter 500 Error Behind Render Proxy

### Symptom
All rate-limited endpoints (register, login) returned 500 Internal Server Error on Render. Non-rate-limited endpoints worked.

### Root Cause
`slowapi`'s default `get_remote_address` reads `request.client.host`, which returns the proxy IP behind Render's edge. The default `swallow_errors=False` meant a storage blip crashed the request.

### Solution
```python
# vitaltrack-backend/app/utils/rate_limiter.py
def get_real_client_ip(request: Request) -> str:
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip: return cf_ip
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for: return forwarded_for.split(",")[0].strip()
    if request.client and request.client.host: return request.client.host
    return "unknown"

limiter = Limiter(
    key_func=get_real_client_ip,
    swallow_errors=True,
    in_memory_fallback_enabled=True,
)
```

### Lesson
Always test rate-limited endpoints behind the real proxy, not just locally.

---

## Challenge 15 (historical, offline-first era): Data Loss on App Reopen (P0)

### Symptom
User adds items → closes app → reopens → everything reset to seed data.

### Root Cause
`loadUserData()` in `useAppStore.ts` called `clearAllUserData()` on every app open, destroying persisted Zustand state **before** the server fetch. If the server was slow (Render cold start) or returned empty, changes were gone.

### Solution at the time
- Only clear when the signed-in user actually changed.
- If server returned empty but local had data, push local to server.
- On network error, preserve local state.

### Status
Obsolete after PR #8. The server is now authoritative. React Query caches are rebuilt from the server on every login; there is no persisted domain state to destroy in the first place.

---

## Challenge 16: Stale Error State Across Auth Screens

### Symptom
"An error occurred" banner appearing on login/register/forgot-password screens before the user does anything.

### Root Cause
`useAuthStore`'s `error` field is shared across screens. Setting it in one screen persists when navigating to another.

### Solution
Clear the error on focus in every auth screen:
```typescript
useFocusEffect(
  useCallback(() => { clearError(); }, [clearError])
);
```

### Lesson
Shared global error state needs explicit cleanup on screen transitions. `useFocusEffect` (every focus) beats `useEffect` (only on mount).

---

## Challenge 17: Logout Requires Double-Tap / Does Nothing

### Symptom
Tapping Logout sometimes did nothing. Confirmation dialog appeared, OK, nothing happens.

### Root Cause (offline-first era)
The logout function ran a long sync-before-logout sequence. If sync took too long or `isLoading` was already true from another operation, the state update didn't trigger a re-render.

### Solution
```typescript
logout: async () => {
    if (get().isLoggingOut) return;
    set({ isLoggingOut: true });
    try {
        await Promise.race([syncOperation(), timeout(5000)]);
    } catch { /* continue */ }
    finally {
        set({ user: null, isAuthenticated: false, isLoggingOut: false });
    }
}
```

### Current State
The sync-before-logout step is gone (server-first — nothing to flush), but the `isLoggingOut` guard was kept to prevent double-tap while the token storage / React Query reset runs.

---

## Challenge 18: Unit Dropdown Can't Scroll on Android

### Symptom
Unit picker in item edit shows only 3–4 options. Can't scroll to see all 30+.

### Root Cause
Nested `ScrollView` inside another `ScrollView`. Android doesn't scroll the inner one without `nestedScrollEnabled={true}`.

### Solution
```tsx
<ScrollView
  style={{ maxHeight: 200 }}
  nestedScrollEnabled={true}
  showsVerticalScrollIndicator={true}
>
```

### Lesson
Android needs explicit `nestedScrollEnabled` for nested ScrollViews. iOS handles it implicitly.

---

## Challenge 19: Email Verification Not Working End-to-End

### Symptom
Register with email → verify-email-pending screen flashes → dashboard. No email arrives. User never blocked.

### Root Causes
1. `MAIL_PASSWORD` missing on Render → emails never sent.
2. Frontend set `isAuthenticated: true` for all registrations → route guard punted to dashboard.
3. `REQUIRE_EMAIL_VERIFICATION` not set on Render.
4. Route guard fired before navigation settled.

### Solution
1. Brevo configured on Render (`MAIL_PASSWORD`, `MAIL_FROM`, `REQUIRE_EMAIL_VERIFICATION=true`).
2. Auth store: email registrations set `isAuthenticated: false`.
3. Register screen uses `router.replace` (not `push`) to verify-email-pending.
4. Verify screen has no "Continue to App" — must verify then "Go to Login".
5. Backend login blocks with `EMAIL_NOT_VERIFIED` only when `MAIL_PASSWORD` is set AND user has an email AND not yet verified.
6. `is_email_configured()` helper prevents silent email failures.

### Related
See `docs/EMAIL_VERIFICATION_GUIDE.md` for the full flow and `docs/PHASE1_AUTH_HARDENING.md` for the enumeration leak fix shipped later in PR #12.

---

## Challenge 20: Generic "An Error Occurred" Messages

### Symptom
Every API error showed "An error occurred" — no distinction between wrong password, server down, rate limit.

### Solution
Status-specific copy in `services/api.ts`:
```typescript
switch (response.status) {
    case 401: message = 'Incorrect email/username or password.'; break;
    case 429: message = 'Too many attempts. Please wait a moment.'; break;
    case 500:
    case 502:
    case 503:
        message = 'Server temporarily unavailable.'; break;
    // ... etc
}
```

Network error copy tuned for Render cold starts:
```
"Unable to connect to server. The server may be starting up — please wait a moment and try again."
```

---

## Challenge 21: Auth Initialize Clears State on Network Failure

### Symptom
Open app after a long idle → long wait (cold start) → user is logged out with everything gone.

### Root Cause
`initialize()` called `tokenStorage.clearTokens()` on ANY error, including a network timeout. The token was still valid, but we threw it away.

### Solution
Only clear tokens on explicit 401; preserve cached auth on network errors:
```typescript
} catch (error) {
    const apiError = error as { status?: number };
    if (apiError.status === 401) {
        await tokenStorage.clearTokens();
    } else {
        // Network / timeout — keep existing state
        set({ isLoading: false, isInitialized: true });
    }
}
```

---

## Challenge 22: 409 Conflict on Concurrent Item Updates (PR #9 era)

### Symptom
Two rapid updates to the same item — second one silently won, overwriting the first.

### Root Cause
No optimistic concurrency control. Last-write-wins is unsafe for inventory quantities.

### Solution
Added a `version` column to `items` (migration `20260406_add_version_audit_log_quantity_check.py`). Updates now assert the `version` they expected and bump it. Conflicting updates return **409 Conflict** with `{server_version, server_quantity}` so the client can reconcile. Same migration also added an `audit_log` table and a `CHECK (quantity >= 0)` constraint.

---

## Challenge 23: Authentication Hardening (PR #12)

### What changed
- **Config validators** — `SECRET_KEY` must be ≥32 chars; in production rejects anything starting with `"CHANGE-THIS"`.
- **FRONTEND_URL validator** — required in production, otherwise emails contain broken links.
- **CORS_ORIGINS validator** — rejects `"*"` in production (prevents accidental open-CORS on a rebrand deploy).
- **Session revocation on password change** — `change_password` now revokes all refresh tokens, same as `reset_password`. The response message tells the user their other devices will need to re-login.
- **Email required at registration** — `UserRegister.email` is no longer optional. Username-only accounts have no recovery path and are a support liability; Play Store requires account recovery. Username remains optional.
- **Enumeration-safe resend** — `POST /auth/resend-verification` returns identical text whether the email exists, is already verified, or doesn't exist.

### Tests
Made email required broke tests that registered with username only. `conftest.py`'s `register_user` helper now auto-generates `<identifier>@test.com` when the caller doesn't pass an email. See `docs/PHASE1_AUTH_HARDENING.md`.

---

## Challenge 24: Play-Store-Compliant Account Deletion (PR #13)

### What it is
Google Play requires an in-app path to delete an account and all its data. The naive approach — delete immediately on button tap — is both policy-risky (missclicks) and token-hijack-risky (a stolen access token can wipe an account).

### Solution — two-step, email-confirmed deletion
1. `DELETE /auth/me` — generate a raw token (`secrets.token_urlsafe(32)`), store `SHA-256(raw)` with a 24-hour expiry on the user row, send the raw token in a confirmation email via `BackgroundTask`. **No data deleted yet.**
2. `GET /auth/confirm-delete/{token}` — user clicks email link. Backend hashes the incoming token, verifies the DB hash + expiry, then `db.delete(user)`. DB-level `ondelete="CASCADE"` on every FK tears down categories, items, orders, order_items, activity_logs, refresh_tokens, audit_logs.
3. `POST /auth/cancel-delete` — authenticated nullifier for `deletion_token` and `deletion_token_expires`. Pending email link becomes invalid.

Schema change: migration `20260419_add_account_deletion_token_fields.py` adds two nullable columns to `users`. Safe on a live DB with zero downtime.

See `docs/PHASE2_ACCOUNT_DELETION.md` for the full walkthrough including the cascade audit, token pattern reasoning, and the mobile Profile screen work.

---

## Architecture Decisions

### Why server-first (post PR #8)?

The original design was offline-first with AsyncStorage + a hand-rolled sync queue. It was **wrong for this app**:
- Medical inventory data is already small (hundreds of items, not thousands).
- Data consistency matters more than offline edit capability — a nurse adding a phantom BiPAP because a sync queue replayed a stale op is worse than briefly not being able to edit during a 10-second Render cold start.
- Sync code is a perpetual source of edge cases (Challenges 15, 17 above). Eliminating it eliminated an entire bug category.

React Query + Zustand-UI-only gives us: server is the truth, the cache is read-through, mutations round-trip to the server before we update the UI. Error cases are the network's problem, handled once in `services/api.ts`, not in every screen.

### Why per-user isolation in queries?

Every domain table (`categories`, `items`, `orders`, `activity_logs`) has a `user_id` FK. Every list query filters by the authenticated user. A compromised access token can't read another tenant's data — the SQL physically cannot return rows for a different `user_id`.

### Why UUIDs?

- Offline-created IDs (historical reason — no longer needed post-PR #8) wouldn't collide with server-assigned ones.
- Even now, UUIDs make debugging easier (no ordered IDs leaking aggregate counts; logs can be grepped precisely).
- The overhead vs. bigint is negligible for this dataset size.

### Images as local file paths, not blobs

Item photos are stored as `file://...` paths on the device. The DB column `imageUri` stores the string, not the binary.

**Consequence:** uninstall → reinstall wipes the photos (OS-owned cache folder deleted) while structured data (items, quantities, categories, orders) is preserved via the DB.

**Why this tradeoff:**
- Neon free tier has 0.5 GB storage; storing images as base64 in the DB would exhaust it quickly.
- Syncing image binaries on every query would be slow over mobile networks.
- Photos are supplementary (reference snapshots), not clinical data.
- Same pattern as WhatsApp, Instagram, most inventory tools.

**Future upgrade path if needed:**
1. Cloud object storage (S3, Cloudinary, Supabase Storage) — upload to URL, store URL.
2. Base64 in DB — not recommended.
3. Accept the tradeoff — current default.

### Android 13+ photo picker and permissions

On Android 13+, `expo-image-picker` uses the **system Photo Picker API** — an OS-level UI that runs outside the app's process. The user picks a photo, the OS hands back that one file, and no permission is required because the app never sees the rest of the gallery.

| Action | Permission? | Why |
|--------|------------|-----|
| Pick via system picker | **No** | OS mediates access |
| Access full gallery | Yes (`READ_MEDIA_IMAGES`) | App browses everything |
| Take a photo (camera) | Yes (`CAMERA`) | Direct hardware |
| Write to shared storage | Yes (`WRITE_EXTERNAL_STORAGE`) | Outside sandbox |

Our `app.json` declares `CAMERA`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`. On Android 13+, `READ_EXTERNAL_STORAGE` is ignored in favour of the picker. `CAMERA` is prompted at first tap of "Take Photo", not at install.

---

## Performance Optimizations

### Eager loading for orders
Prevents N+1 queries when listing orders with their items:
```python
select(Order).options(selectinload(Order.items))
```

### React Query stale/garbage time
Short `staleTime` for dashboards (15 s) so refreshes feel live; longer `gcTime` (5 min) to avoid refetching when switching tabs.

### Rate limiter in-memory fallback
`swallow_errors=True` + `in_memory_fallback_enabled=True` — auth endpoints degrade gracefully if the limiter storage hiccups (Challenge 14).

---

## Security Implementations

### Password hashing
Argon2 (OWASP-recommended) with bcrypt fallback for legacy rows:
```python
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
```

### JWT
HS256 (symmetric), 30-minute access tokens, 30-day refresh tokens. Refresh tokens rotate on every use — the old one is marked revoked, a new JTI is issued.

### Token revocation on password/reset change (PR #12)
```python
await db.execute(
    update(RefreshToken)
    .where(RefreshToken.user_id == current_user.id)
    .values(is_revoked=True)
)
```
Every device must re-login after the password changes. Response message says so.

### Rate limiting
```
register           3/hour
login              5/min
forgot-password    3/hour
resend-verify      3/hour
reset-password     5/hour
```

### Account deletion (PR #13)
Hash-on-server + 24 h expiry + email out-of-band confirmation + DB cascade. Plaintext token exists only in the email.

---

## Testing Checklist

After domain-data changes:
```
[ ] Create item → appears in inventory
[ ] Edit item → changes persist after app restart
[ ] Delete item → gone after app restart
[ ] Logout → login → data unchanged
[ ] Create on device A → appears on device B after pull-to-refresh
[ ] Go to airplane mode → read still works (React Query cache) → recover
[ ] Critical item at qty=1 → Emergency Backup shows it
[ ] Out-of-stock critical item → Emergency Backup shows it
```

---

## Common Debug Commands

```bash
# Backend logs
docker compose -f docker-compose.dev.yml logs -f api

# Postgres shell
docker compose -f docker-compose.dev.yml exec db psql -U postgres -d carekosh
# then: SELECT name, quantity, version FROM items WHERE user_id = 'xxx';

# Recently-touched items (sanity after a migration)
SELECT COUNT(*) FROM items WHERE updated_at > NOW() - INTERVAL '5 minutes';

# Smoke one endpoint
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"Test123!"}'
```

---

*Last updated 2026-04-19 · tracks changes through PR #13.*
