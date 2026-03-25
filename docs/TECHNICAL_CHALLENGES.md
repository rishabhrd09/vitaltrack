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
