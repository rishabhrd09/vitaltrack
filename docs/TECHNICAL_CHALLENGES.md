# Technical Challenges & Solutions

> **Lessons learned** during VitalTrack development. Reference for debugging similar issues.

---

## Challenge 1: Critical Items Not Showing Emergency Backup

### Symptom
BiPAP machine with `qty=1` showed as "Normal" instead of "Low Stock" + "Emergency Backup Required"

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
  
  // CRITICAL FIX: Critical equipment with only 1 unit = ALWAYS LOW STOCK
  if (isCriticalEquipment(item) && item.quantity === 1) {
    return true;
  }
  
  // Standard: below minimum
  if (item.quantity < item.minimumStock) {
    return true;
  }
  
  return false;
};
```

### Files Changed
- `vitaltrack-mobile/types/index.ts` (lines 125-148)

---

## Challenge 2: Activity Logs Disappearing After Login

### Symptom
User makes changes → logs out → logs back in → Activity logs empty

### Root Cause
`loadUserData()` was resetting `activityLogs` to `[]` every login without preserving saved logs.

### Solution
1. Store activity logs **per-user** in AsyncStorage
2. Load saved logs **before** clearing state
3. Persist logs on every change

```typescript
// FIXED: store/useAppStore.ts

// Save per-user (called on every activity)
export async function saveUserActivityLogs(userId: string, logs: ActivityLog[]) {
  const key = `vitaltrack_activity_${userId}`;
  await AsyncStorage.setItem(key, JSON.stringify(logs.slice(0, 100)));
}

// Load on login (called in loadUserData)
export async function loadUserActivityLogs(userId: string): Promise<ActivityLog[]> {
  const key = `vitaltrack_activity_${userId}`;
  const data = await AsyncStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

// In loadUserData():
const savedActivityLogs = await loadUserActivityLogs(userId);  // Load FIRST
set({
  categories: [],
  items: [],
  activityLogs: savedActivityLogs,  // Preserve, don't reset!
  // ...
});
```

### Files Changed
- `vitaltrack-mobile/store/useAppStore.ts` (lines 47-78, 855-969)

---

## Challenge 3: Emergency Backup Missing Out-of-Stock Items

### Symptom
Emergency Backup section only showed critical items at qty=1, not qty=0

### Root Cause
Only filtering from `lowStockItems`, which excludes qty=0 items.

### Solution
Combine both low-stock AND out-of-stock critical items:
```typescript
// FIXED: components/dashboard/NeedsAttention.tsx
const lowStockEmergencyItems = lowStockItems.filter(item => needsEmergencyBackup(item));
const outOfStockCriticalItems = outOfStockItems.filter(item => isCriticalEquipment(item));

// Combine: critical items at qty=0 OR qty=1 need emergency backup
const emergencyBackupItems = [...lowStockEmergencyItems, ...outOfStockCriticalItems];
```

### Files Changed
- `vitaltrack-mobile/components/dashboard/NeedsAttention.tsx` (lines 42-48)

---

## Challenge 4: Phone Can't Connect to Backend (WiFi)

### Symptoms
- "Network request failed" in app
- Phone browser times out on PC IP

### Root Causes (in order of likelihood)
1. **Windows Firewall** blocking port 8000
2. **Wrong IP** in `.env` file
3. **Phone on different WiFi** network
4. **Backend not running**

### Solution
See [LOCAL_TESTING_COMPLETE_GUIDE.md](LOCAL_TESTING_COMPLETE_GUIDE.md) Section E

**Quick fix (Windows):**
```powershell
netsh advfirewall firewall add rule name="FastAPI Dev" dir=in action=allow protocol=tcp localport=8000
```

---

## Challenge 5: Docker Database Won't Start

### Symptom
```
Error: port 5432 already in use
```

### Root Cause
Local PostgreSQL service running on same port

### Solution
**Windows:**
```cmd
net stop postgresql-x64-16
```

**Mac:**
```bash
brew services stop postgresql
```

**Alternative:** Change port in `docker-compose.dev.yml`:
```yaml
ports:
  - "5433:5432"  # Use 5433 externally
```

---

## Challenge 6: Expo Cache Causing Stale Code

### Symptom
Changes to `.env` or code not reflected in app

### Root Cause
Metro bundler caches aggressively

### Solution
**ALWAYS use `--clear` after `.env` changes:**
```bash
npx expo start --clear
```

**For stubborn issues:**
```bash
rm -rf node_modules .expo
npm install --legacy-peer-deps
npx expo start --clear
```

---

## Challenge 7: Sync Data Loss on Logout

### Symptom
User makes changes → logs out → changes lost

### Root Cause
Logout was clearing local state before syncing to backend

### Solution
Implemented **sync-before-logout** pattern:
```typescript
// In logout flow:
await get().syncToBackend();  // Push all data FIRST
await get().clearStore();      // Then clear local state
```

### Files Changed
- `vitaltrack-mobile/store/useAuthStore.ts`
- `vitaltrack-mobile/store/useAppStore.ts`

---

## Challenge 8: API Schema Mismatch

### Symptom
Sync operations failing with validation errors

### Root Cause
Frontend using camelCase, backend expecting snake_case

### Solution
Used Pydantic aliases for bidirectional mapping:
```python
# Backend: schemas/sync.py
class SyncOperation(BaseModel):
    entity_id: str = Field(..., alias="entityId")
    local_id: str = Field(..., alias="localId")
    
    model_config = {"populate_by_name": True}  # Accept both formats
```

---

## Challenge 9: Expo Go "Unable to Download Remote Update" (SDK 54)

### Symptom
App loads in Expo Go but immediately crashes with: `Something went wrong. Fatal error: failed to download remote update`

### Root Cause
`expo-updates` package was installed as a dependency but **no `updates` configuration existed in `app.json`**. Expo Go tried to fetch OTA updates from Expo's servers, found no update URL configured, and crashed before the app could even render.

### Solution
Disable OTA updates in `app.json`:
```json
{
  "expo": {
    "updates": {
      "enabled": false
    }
  }
}
```

### Why This Works
The `expo-updates` package is needed for production OTA update support, but in development with Expo Go, it tries to check for remote updates on app launch. Disabling it tells Expo Go to skip the update check and load the JavaScript bundle directly from Metro.

### Files Changed
- `vitaltrack-mobile/app.json` (added `updates.enabled: false`)

---

## Challenge 10: ADB Reverse Port Mapping Corruption

### Symptom
App loads, UI renders, but all API calls return **404**. Login and registration fail with `[API] Status: 404`.

### Root Cause
Running `adb reverse` with incorrect port mapping. The actual state was:
```
tcp:8000 → tcp:8081   ← WRONG! Backend port mapped to Metro bundler
tcp:8081 → tcp:8081   ← Correct
```
Port 8000 on the phone was routing to Metro (8081) instead of the FastAPI backend (8000). Every API call hit Metro's HTTP server which returned 404.

### How to Diagnose
```bash
adb reverse --list
```
Check that `tcp:8000` maps to `tcp:8000` (not `tcp:8081`).

### Solution
```bash
adb reverse --remove-all
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
adb reverse --list
# Verify: tcp:8000 → tcp:8000, tcp:8081 → tcp:8081
```

### Prevention
Always run `adb reverse --remove-all` before setting up new mappings. Stale or incorrect mappings persist across Expo restarts.

---

## Challenge 11: Expo Go Auto-Update Uninstalls Itself (Phone Storage Full)

### Symptom
Pressing `a` in Expo terminal triggers: `Install the recommended Expo Go version?` → Accept → Expo Go uninstalled → New version fails to install with `java.io.IOException: not enough space`.

Now the phone has NO Expo Go at all.

### Root Cause
Expo CLI auto-detected a minor version mismatch (54.0.6 on phone vs 54.0.7 recommended), uninstalled the old version first, then failed to install the new one due to insufficient storage.

### Solution
1. Free up phone storage (delete unused apps, clear cache)
2. Reinstall Expo Go from Play Store manually
3. When Expo asks to update, say **NO** — minor patch differences (54.0.6 vs 54.0.7) are compatible

### Prevention
Always decline Expo Go auto-updates if phone storage is low. Minor version differences within the same SDK (54.x) are compatible.

---

## Challenge 12: Windows Firewall Blocks Phone-to-PC Connection

### Symptom
Phone browser cannot reach `http://192.168.x.x:8000/health` — shows "Site unreachable". Same Wi-Fi confirmed.

### Root Cause
Windows Firewall blocks inbound connections to port 8000 and 8081 by default.

### Solution
Run in **PowerShell as Administrator**:
```powershell
New-NetFirewallRule -DisplayName "VitalTrack Backend 8000" -Direction Inbound -Port 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Port 8081 -Protocol TCP -Action Allow
```

### Alternative: USB Method
If firewall rules don't help (corporate networks, AP isolation on router), use USB debugging with `adb reverse` — bypasses network entirely.

---

## Challenge 13: Ngrok Tunnel Service Down

### Symptom
`npx expo start --tunnel` fails with `CommandError: failed to start tunnel — remote gone away`

### Root Cause
Ngrok's relay service was experiencing an outage. Tunnel mode routes Metro traffic through Ngrok's servers — if they're down, it can't work.

### Solution
Use LAN mode (`npx expo start --lan`) or USB mode (`npx expo start --localhost` with `adb reverse`) instead. Tunnel mode is a convenience, not a requirement.

### When to Use Each Mode
| Mode | Command | When to Use |
|------|---------|-------------|
| LAN | `npx expo start --lan` | Phone and PC on same Wi-Fi, no firewall issues |
| Localhost + USB | `npx expo start --localhost` | Wi-Fi doesn't work, USB cable available |
| Tunnel | `npx expo start --tunnel` | Different networks, no USB cable |

---

## Challenge 14: Rate Limiter 500 Error Behind Cloudflare/Render Proxy

### Symptom
All rate-limited endpoints (register, login) returned `500 Internal Server Error` on Render. Non-rate-limited endpoints worked fine.

### Root Cause
The `slowapi` rate limiter's default `get_remote_address` function got the proxy IP instead of the real client IP. Behind Render's Cloudflare proxy, `request.client.host` returns the proxy's IP. The `swallow_errors=False` default meant any storage issue crashed the request.

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

### Key Insight
Always test rate-limited endpoints behind the actual production proxy, not just locally.

---

## Challenge 15: Data Loss on App Reopen (P0)

### Symptom
User adds items, edits quantities → closes app → reopens → everything reset to default seed data.

### Root Cause
`loadUserData()` in `useAppStore.ts` called `clearAllUserData()` on EVERY app open (line 866), destroying the locally persisted Zustand state BEFORE fetching from the server. If the server was slow (Render cold start) or returned empty data, local changes were permanently gone.

### Solution
- Only call `clearAllUserData()` when switching between different users
- If server returns empty but local data exists, preserve local data and push it to server
- On network error, preserve existing local state instead of overwriting with seed data

### Key Insight
Never destroy local data before confirming server has a complete copy. Merge, don't replace.

---

## Challenge 16: Stale Error State Across Auth Screens

### Symptom
"An error occurred" banner showing on login/register/forgot-password screens before user does anything.

### Root Cause
Zustand `error` field is shared across all auth screens. When one screen sets an error, navigating to another screen doesn't clear it. The error renders immediately on mount.

### Solution
Added `useFocusEffect` with `clearError()` to all three auth screens:
```typescript
useFocusEffect(
    useCallback(() => {
        clearError();
    }, [clearError])
);
```

### Key Insight
Shared global error state needs explicit cleanup on screen transitions. Use `useFocusEffect` (fires on every focus), not `useEffect` (fires only on mount).

---

## Challenge 17: Logout Requires Double-Tap / Does Nothing

### Symptom
Tapping logout sometimes does nothing. Confirmation dialog appears but after "OK", nothing happens.

### Root Cause
The logout function ran a long sync-before-logout sequence. If sync took too long or `isLoading` was already true from a previous operation, the state update didn't trigger re-render.

### Solution
1. Added `isLoggingOut` guard to prevent double-tap
2. Wrapped sync in `Promise.race` with 5-second timeout
3. Used `finally` block to ALWAYS reset state, even if sync fails

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

---

## Challenge 18: Unit Dropdown Can't Scroll on Android

### Symptom
The unit picker dropdown in item edit shows only 3-4 options. Cannot scroll to see 30+ available units.

### Root Cause
Nested `ScrollView` inside another `ScrollView`. On Android, the inner ScrollView doesn't scroll without `nestedScrollEnabled={true}`.

### Solution
```tsx
<ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
```

### Key Insight
Android requires explicit `nestedScrollEnabled` for nested ScrollViews. iOS handles this automatically.

---

## Challenge 19: Email Verification Not Working End-to-End

### Symptom
Register with email → verify-email-pending screen flashes briefly → goes straight to dashboard. No verification email arrives. User can never be blocked.

### Root Cause (Multiple Issues)
1. `MAIL_PASSWORD` (Brevo API key) wasn't configured on Render → emails never sent
2. Frontend set `isAuthenticated: true` for ALL registrations → route guard kicked user to dashboard
3. `REQUIRE_EMAIL_VERIFICATION` defaulted to `True` in code but wasn't set on Render
4. Route guard timing: `useEffect` fired before navigation to verify screen settled

### Solution (4-Part Fix)
1. **Brevo configured on Render**: `MAIL_PASSWORD`, `MAIL_FROM`, `REQUIRE_EMAIL_VERIFICATION=true`
2. **Auth store**: Email registrations set `isAuthenticated: false` — user stays in auth group
3. **Register screen**: Uses `router.replace` (not push) to verify-email-pending — no escape
4. **Verify screen**: Removed "Continue to App" — must verify first, then "Go to Login"
5. **Backend guard**: Login blocked with `EMAIL_NOT_VERIFIED` only when `MAIL_PASSWORD` is configured
6. **Backend email.py**: `is_email_configured()` check prevents silent email failures

### Auth Flow After Fix
```
Email registration → isAuthenticated=false → verify-email-pending (blocked)
  → User clicks email link → verified in DB
  → User taps "Go to Login" → login succeeds → dashboard

Username registration → isAuthenticated=true → dashboard immediately
```

---

## Challenge 20: Generic "An Error Occurred" Messages

### Symptom
Every API error showed "An error occurred" — no distinction between wrong password, server down, rate limit, etc.

### Root Cause
`api.ts` had a single fallback: `let message = 'An error occurred'`. No HTTP status code differentiation.

### Solution
Replaced with status-specific messages:
```typescript
switch (response.status) {
    case 401: message = 'Incorrect email/username or password.'; break;
    case 429: message = 'Too many attempts. Please wait a moment.'; break;
    case 500: case 502: case 503:
        message = 'Server temporarily unavailable.'; break;
    // ... etc
}
```

Also improved network error for Render cold starts:
```typescript
'Unable to connect to server. The server may be starting up — please wait a moment and try again.'
```

---

## Challenge 21: Auth Initialize Clears State on Network Failure

### Symptom
Open app after it's been closed → long wait (Render cold start) → user logged out with all data gone.

### Root Cause
`initialize()` called `tokenStorage.clearTokens()` on ANY error, including network timeouts. This logged the user out even though their token was still valid.

### Solution
Only clear tokens on explicit 401 (token actually invalid). On network errors, preserve cached auth state:
```typescript
} catch (error) {
    const apiError = error as { status?: number };
    if (apiError.status === 401) {
        await tokenStorage.clearTokens(); // Token invalid
    } else {
        // Network error — keep existing state
        set({ isLoading: false, isInitialized: true });
    }
}
```

---

## Architecture Decisions

### Why Offline-First?
Medical caregivers **cannot depend on internet** during emergencies. Data must be available locally, synced when possible. This is non-negotiable for a medical app.

### Why Per-User Activity Logs?
- Activity logs are **personal audit trails**
- Not synced to server (reduces payload, preserves privacy)
- Stored separately from main Zustand store (avoids sync issues)

### Why AsyncStorage for Activity Logs?
- Survives app restarts
- Survives logout/login cycles
- Separate from Zustand persistence (different lifecycle)

### Why UPSERT for Sync?
- Idempotent operations (safe to retry)
- Handles both create and update with single endpoint
- Orphan cleanup handles deletes

### Why Orphan Cleanup?
When user deletes item locally:
1. Local state removes item
2. Push sends all existing items
3. Backend compares: "What's in DB but not in push?"
4. Those orphans are deleted

### Why Images Are NOT Stored in the Database
Images added to items are stored as **local file paths** on the phone's filesystem (e.g., `file:///data/user/0/com.vitaltrack.mobile/cache/photo.jpg`). The Neon database only stores the path string (`imageUri`), not the image binary.

**Consequence:** When the app is uninstalled and reinstalled, the image files are deleted by Android but the path strings persist in the database. The app tries to load the old paths → files don't exist → images appear blank. All other data (items, quantities, categories, orders) is preserved via the database.

**Why this tradeoff:**
- Neon free tier has 0.5 GB storage — storing images as base64 would exhaust it quickly
- Syncing image binaries on every pull/push would be extremely slow on mobile networks
- Images are supplementary (item reference photos), not critical medical data
- This is the same pattern used by WhatsApp ("media not included in backup"), Instagram, and most inventory apps

**Future upgrade path (if needed):**
1. **Cloud storage** (S3, Cloudinary, Supabase Storage) — upload images to a URL, store URL in database. Best solution for persistence across installs.
2. **Base64 in database** — simple but heavy, not recommended at scale.
3. **Accept the tradeoff** — current approach is fine for a medical supply tracker where photos are optional reference images.

### Why No Permission Popup When Picking Photos
On Android 13+, `expo-image-picker` uses the **system Photo Picker API** — an OS-level UI that runs outside the app's process. The user selects a photo, and the OS gives the app access to **only that specific file**. No permission is needed because the app never accesses the full gallery.

**Permission behavior by action:**

| Action | Permission Needed? | Why |
|--------|-------------------|-----|
| Pick photo via system picker | **No** | OS mediates access, gives only the selected file |
| Access full gallery / all photos | **Yes** (`READ_MEDIA_IMAGES`) | App wants to browse everything |
| Take a new photo with camera | **Yes** (`CAMERA`) | Direct hardware access |
| Save file to shared storage | **Yes** (`WRITE_EXTERNAL_STORAGE`) | Writing outside app sandbox |

**Our `app.json` declares permissions:**
```json
"permissions": ["android.permission.CAMERA", "android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE"]
```

But on Android 13+, `READ_EXTERNAL_STORAGE` is ignored — the OS uses the photo picker instead. `CAMERA` permission is requested at runtime only when the user taps "Take Photo". Permissions are declared in the manifest but only prompted **at the moment they're needed**, not on install. This is standard Android behavior — same as Instagram, WhatsApp, etc.

---

## Performance Optimizations

### 1. Sync Queue Persistence
Operations queued to AsyncStorage survive app crashes:
```typescript
const SYNC_QUEUE_KEY = 'vitaltrack_sync_queue';
// Operations persisted immediately on queue
```

### 2. Activity Log Limit
Capped at 100 entries to prevent storage bloat:
```typescript
const logsToSave = logs.slice(0, 100);
```

### 3. Eager Loading for Orders
Prevents N+1 queries:
```python
select(Order).options(selectinload(Order.items))
```

---

## Security Implementations

### Password Hashing
Using Argon2 (OWASP recommended):
```python
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
```

### Token Rotation
Refresh tokens rotated on use (prevents replay):
```python
stored_token.is_revoked = True  # Old token
new_refresh_token = RefreshToken(jti=new_jti, ...)  # New token
```

### Rate Limiting
Protects auth endpoints:
```python
@limiter.limit("3/hour")  # Registration
@limiter.limit("5/minute")  # Login
```

---

## Testing Checklist

After any sync-related changes:
```
□ Create item locally → verify appears in inventory
□ Edit item → verify changes persist after app restart
□ Delete item → verify removed after sync
□ Logout → login → verify all data preserved
□ Create on device A → verify appears on device B
□ Offline edit → go online → verify syncs
□ Critical item at qty=1 → verify Emergency Backup shows
```

---

## Common Debug Commands

```bash
# Check backend logs
docker-compose -f docker-compose.dev.yml logs -f api

# Check database directly
docker-compose exec db psql -U postgres -d vitaltrack
SELECT name, quantity, local_id FROM items WHERE user_id = 'xxx';

# Check sync worked
SELECT COUNT(*) FROM items WHERE updated_at > NOW() - INTERVAL '5 minutes';

# Test API endpoint
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"Test123!"}'
```
