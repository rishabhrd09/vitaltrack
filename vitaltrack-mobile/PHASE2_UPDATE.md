# VitalTrack Frontend Update - Phase 2

## What Was Added

| File | Purpose |
|------|---------|
| `services/api.ts` | HTTP client with JWT, token refresh |
| `services/auth.ts` | Auth API calls (login, register, etc.) |
| `store/useAuthStore.ts` | Auth state management (Zustand) |
| `app/(auth)/_layout.tsx` | Auth stack layout |
| `app/(auth)/login.tsx` | Login screen |
| `app/(auth)/register.tsx` | Registration screen |
| `app/(auth)/forgot-password.tsx` | Password reset request |
| `app/(auth)/reset-password.tsx` | New password entry |

**Modified:** `types/index.ts` - Added User, AuthResponse types

---

## Installation (TESTED ✅)

```bash
cd vitaltrack-mobile-main

# IMPORTANT: Use --legacy-peer-deps (required for React 19)
npm install --legacy-peer-deps

# Start Expo
npx expo start --clear
```

---

## Backend Configuration

Create `.env` in project root:

```ini
# Physical device - use your computer's IP
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000

# Android Emulator
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000
```

---

## API Endpoints Used

| Feature | Endpoint |
|---------|----------|
| Register | `POST /api/v1/auth/register` |
| Login | `POST /api/v1/auth/login` |
| Logout | `POST /api/v1/auth/logout` |
| Refresh Token | `POST /api/v1/auth/refresh` |
| Get Profile | `GET /api/v1/auth/me` |
| Update Profile | `PATCH /api/v1/auth/me` |
| Change Password | `POST /api/v1/auth/change-password` |
| Forgot Password | `POST /api/v1/auth/forgot-password` |
| Reset Password | `POST /api/v1/auth/reset-password` |
| Verify Email | `GET /api/v1/auth/verify-email/{token}` |
| Resend Verification | `POST /api/v1/auth/resend-verification` |

---

## Next Steps (Phase 3)

1. Add auth guard to `app/_layout.tsx`
2. Add Profile screen
3. Replace local storage with API calls
4. Add offline sync queue
