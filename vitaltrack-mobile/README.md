# CareKosh Mobile

> React Native + Expo mobile app for the CareKosh home-ICU medical inventory platform.

[![React Native](https://img.shields.io/badge/React%20Native-0.76-61DAFB?logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)
[![TanStack Query](https://img.shields.io/badge/TanStack%20Query-v5-FF4154)](https://tanstack.com/query)

> The directory name `vitaltrack-mobile/` is legacy (CareKosh was formerly VitalTrack). Do not rename — `eas.json` and Render service paths depend on it.

---

## Quick start

### Prerequisites
- Node.js 20+
- Expo Go app on your phone
- Backend running — see [../vitaltrack-backend/README.md](../vitaltrack-backend/README.md)

### Install & run

```bash
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
```

Scan the QR code with Expo Go.

**Phone can't reach `localhost:8000`?** Either `adb reverse tcp:8000 tcp:8000` (USB) or set `EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000`.

---

## Architecture — server-first, not offline-first

CareKosh was migrated from an offline-first architecture to **server-first** in PR #8 (`refactor/server-first-architecture`). The backend is the single source of truth; the mobile app does **not** maintain an offline queue, does **not** persist domain data locally, and does **not** reconcile conflicts on reconnect.

| Concern | How it's handled |
|---|---|
| Server reads | [`@tanstack/react-query`](https://tanstack.com/query) — caching, revalidation, background refresh |
| Server writes | TanStack mutations — optimistic UI + rollback on error |
| Concurrent edits | Optimistic concurrency: `items.version` column, HTTP 409 on stale updates, client re-fetches and retries |
| UI state | `zustand` — intentionally minimal (~61 lines in `useAppStore.ts`) |
| Auth tokens | `expo-secure-store` (hardware-backed keystore on Android) |

No `redux-persist`, no AsyncStorage-backed domain state, no `services/sync.ts`, no `useSyncStore`. These were all removed in PRs #4–#8.

---

## Project structure

```
vitaltrack-mobile/
├── app/                          # expo-router file-based routing
│   ├── _layout.tsx               # root Stack: (auth), (tabs), item/[id], order/create, builder, profile
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   ├── forgot-password.tsx
│   │   ├── reset-password.tsx
│   │   └── verify-email-pending.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx             # dashboard
│   │   ├── inventory.tsx
│   │   └── orders.tsx
│   ├── item/[id].tsx             # item detail / edit modal
│   ├── order/create.tsx          # new-order modal
│   ├── builder.tsx               # bulk inventory seed modal
│   └── profile.tsx               # account info, change password, delete account (PR #13)
├── components/                   # UI components
│   ├── common/
│   ├── dashboard/
│   ├── inventory/
│   └── orders/
├── services/
│   ├── api.ts                    # fetch-based HTTP client with token injection
│   └── auth.ts                   # register / login / logout / requestAccountDeletion / cancelAccountDeletion
├── hooks/
│   ├── useServerData.ts          # TanStack Query hooks (reads)
│   ├── useServerMutations.ts     # TanStack mutation hooks (writes)
│   ├── useNetworkStatus.ts
│   └── useSeedInventory.ts
├── store/
│   ├── useAuthStore.ts           # auth state, tokens via SecureStore
│   └── useAppStore.ts            # UI-only state (isInitialized flag)
├── theme/                        # design tokens
├── types/                        # TypeScript types
└── utils/                        # helpers
```

---

## Screens

| Route | Purpose |
|---|---|
| `(auth)/login` | email-or-username login |
| `(auth)/register` | signup — **email is required** (PR #12) |
| `(auth)/forgot-password` | request password reset email |
| `(auth)/reset-password` | set new password via emailed token |
| `(auth)/verify-email-pending` | waiting room while verification email is processed |
| `(tabs)/index` | dashboard — stats cards, needs-attention alerts, recent activity |
| `(tabs)/inventory` | category-grouped items, search, quick stock update |
| `(tabs)/orders` | order history, status tracking, apply-to-stock |
| `item/[id]` | item detail + editor |
| `order/create` | new order from low-stock suggestions |
| `builder` | bulk inventory seed for first-time setup |
| `profile` | account info, change password, **request account deletion** (PR #13) — reached via swipe-down popup menu from top-right |

---

## Data flow

### Reads (TanStack Query)

```typescript
// hooks/useServerData.ts
export function useItems(filters?: ItemFilters) {
  return useQuery({
    queryKey: ['items', filters],
    queryFn: () => api.get<ItemListResponse>('/items', { params: filters }),
    staleTime: 30_000,
  });
}
```

### Writes (TanStack mutations with OCC)

```typescript
// hooks/useServerMutations.ts
export function useUpdateItemStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity, version }) =>
      api.patch(`/items/${id}/stock`, { quantity, version }),
    onError: (err) => {
      if (err.status === 409) {
        // Server returned { server_version, server_quantity } — refresh and let user retry
        qc.invalidateQueries({ queryKey: ['items'] });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}
```

### Services

- `services/api.ts` — `fetch`-based HTTP client; injects `Authorization: Bearer <access>` from SecureStore; auto-refreshes on 401; throws `ApiClientError`.
- `services/auth.ts` — thin wrapper around `api.ts` for auth flows. Exposes `requestAccountDeletion()` and `cancelAccountDeletion()` for the Profile screen's PR #13 deletion flow.

### Stores

- `store/useAuthStore.ts` (~385 lines) — user object, auth status, login/register/logout/updateUser/forgotPassword/resetPassword actions. Tokens persisted in SecureStore, **not** AsyncStorage.
- `store/useAppStore.ts` (~61 lines) — **UI-only state** (`isInitialized` flag). Domain data (items, categories, orders, activity) lives in the TanStack Query cache, not here.

---

## Environment variables

Create a `.env` (or rely on `eas.json` per-profile values):

```env
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000
```

Restart Expo with `--clear` after changing `.env`.

### EAS profiles (`eas.json`)

| Profile | `EXPO_PUBLIC_API_URL` | Channel | Artifact |
|---|---|---|---|
| `development` | `http://localhost:8000` | — | APK |
| `preview` | `https://vitaltrack-api-staging.onrender.com` | `preview` | APK |
| `production` | `https://vitaltrack-api.onrender.com` | `production` | AAB (Play Store `internal` track) |

---

## Development

```bash
npx expo start --clear             # normal (clears Metro cache)
npx expo start --tunnel            # if LAN blocks direct connect

npx tsc --noEmit                   # type check
npm run lint                       # ESLint
npx expo-doctor                    # checks Expo config sanity
```

### Reset everything
```bash
rm -rf node_modules .expo
npm install --legacy-peer-deps
npx expo start --clear
```

---

## Building

### Preview APK (manual, or via PR label `build-apk`)
```bash
eas build --profile preview --platform android
```

### Production AAB
```bash
eas build --profile production --platform android
eas submit --profile production --platform android   # uploads to Play Console internal track
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Network request failed" | Backend not reachable — check `EXPO_PUBLIC_API_URL` matches a URL your phone can hit; try `adb reverse tcp:8000 tcp:8000` |
| "Unable to resolve module" | `rm -rf node_modules && npm install --legacy-peer-deps` |
| Stuck on splash | `npx expo start --clear` |
| Changes not reflecting | Restart Metro with `--clear` |
| 409 Conflict toast on stock update | OCC working — another device edited the item; the app re-fetches, you retry |
| "Verify email before login" | PR #12 hardening — complete the verification email; `/auth/resend-verification` available |

---

For overall architecture, CI/CD, and full deployment flow, see the repo-root [CAREKOSH_DEVELOPER_GUIDE.md](../CAREKOSH_DEVELOPER_GUIDE.md).
