# CareKosh Play Store Release Hardening - Goal 9

Last reviewed: 2026-06-15  
Scope: Android mobile Play Store release hardening only.

This document records the Goal 9 privacy/platform decisions for the installable
CareKosh Android app. It does not change backend runtime behavior, database
semantics, auth design, inventory/order semantics, or Goal 10 operations work.

## Android Networking

| Build profile | API URL | Cleartext HTTP |
|---|---|---|
| `development` | `http://localhost:8000` | Allowed for local development builds only |
| `preview` | `https://vitaltrack-api-staging.onrender.com` | Disabled |
| `production` | `https://vitaltrack-api.onrender.com` | Disabled |

`vitaltrack-mobile/app.json` defaults `android.usesCleartextTraffic` to `false`.
`vitaltrack-mobile/app.config.js` turns it on only for the `development` EAS
profile, for `EXPO_PUBLIC_API_URL=http://localhost...`, or when a developer sets
`CAREKOSH_ALLOW_ANDROID_CLEARTEXT=true` for a local-only native build. Preview
and production profiles fail config generation if pointed at the wrong HTTPS
backend.

Production `EXPO_PUBLIC_API_URL` remains
`https://vitaltrack-api.onrender.com`.

## Android Permissions

Explicit Android permissions in `app.json`:

| Permission | Decision | Rationale |
|---|---|---|
| `android.permission.ACCESS_NETWORK_STATE` | Keep | Needed for network-aware UX and connectivity-dependent flows through React Native/NetInfo. Not a high-risk Play permission. |
| `android.permission.INTERNET` | Keep, auto-added by Expo/React Native | Required for the server-first API client. Preview and production API traffic is HTTPS-only. |
| `android.permission.CAMERA` | Block | CareKosh uses `ImagePicker.launchImageLibraryAsync`, not `launchCameraAsync`; there is no camera capture feature. |
| `android.permission.RECORD_AUDIO` | Block | No microphone/audio recording feature exists. |
| `android.permission.SYSTEM_ALERT_WINDOW` | Block | No production overlay/draw-over-other-apps feature exists. |
| `android.permission.VIBRATE` | Block | `expo-haptics` is installed but no current runtime code uses haptic feedback. |
| `android.permission.READ_EXTERNAL_STORAGE` | Block | Legacy broad storage access is not needed for app-sandbox PDF generation or user-initiated share-sheet export. |
| `android.permission.WRITE_EXTERNAL_STORAGE` | Block | PDF/JSON backups are written to the app sandbox and then shared through the system share sheet; broad external write access is not needed. |

Image selection is limited to user-selected library assets. PDF export uses
`expo-print`, app-sandbox file copies through `expo-file-system/legacy`, and
user-initiated sharing through `expo-sharing`.

Before Play upload, inspect the generated manifest from the exact EAS artifact.
If Expo/ImagePicker adds modern media-picker permissions, keep only permissions
that are actually present and required for user-selected photo import, and list
them in the Play permissions rationale.

## Production Logging

Runtime mobile logs now go through `vitaltrack-mobile/utils/logger.ts`. The
logger writes only when React Native `__DEV__` is true. Production builds do not
emit app runtime console logs.

Sensitive values intentionally removed from runtime logs:

- Email addresses, usernames, and account identifiers.
- Access tokens, refresh tokens, and token-adjacent payloads.
- API URLs, endpoints with IDs, response bodies, and raw backend error payloads.
- Raw image/PDF/export exceptions in production.
- Inventory/category/item names from seed or destructive flows in production.

Non-runtime script output remains allowed for developer-only scripts such as
`vitaltrack-mobile/scripts/generate-icons.js`.

## Cache, SecureStore, And Android Backup

### AsyncStorage Query Cache

React Query persistence uses AsyncStorage key `carekosh-query-cache` from
`vitaltrack-mobile/providers/QueryProvider.tsx`. The cache is read-only display
state: mutations still go server-first and the cache is never uploaded back to
the backend as source of truth.

Persisted query data may include:

- `['items']` and item-detail queries: item names, descriptions, quantity,
  unit, minimum stock, expiry date, brand, notes, supplier name/contact,
  purchase link, selected image URI, critical flag, version, created/updated
  timestamps.
- `['categories']`: category names, icon/color/description/display order,
  default/active flags, created/updated timestamps.
- `['orders']`: order IDs, order item names/brands/units/quantities/current
  stock/minimum stock/category name/image URI/supplier name/purchase link,
  status, PDF path, exported/ordered/received/applied/declined timestamps.
- `['items', 'stats']`: aggregate inventory counters, low/out-of-stock counts,
  pending order count.
- `['activities']`: visible activity feed snapshots such as action type, item
  name, details, timestamp, and order ID. Auth/sync activity types are hidden
  from the mobile feed but server responses may still be display snapshots.

Auth-related query keys whose first segment is `auth`, `user`, or `me` are not
persisted. Access and refresh tokens are never stored in AsyncStorage.

### Auth Storage

Access and refresh tokens are stored through `expo-secure-store` only:

- `vitaltrack_access_token`
- `vitaltrack_refresh_token`

The Zustand auth store uses SecureStore-backed persistence for the lightweight
`vitaltrack-auth` state containing `user` and `isAuthenticated`. It does not
persist tokens in AsyncStorage.

### Cache Clearing

On login, the app clears the in-memory query client and removes
`carekosh-query-cache` before fetching the new user's data. On logout, it clears
the same in-memory and AsyncStorage cache before resetting UI state and clearing
tokens. This prevents shared-device leakage across users.

### Android Backup Decision

`android.allowBackup` is set to `false` for the Android app. This disables
Android Auto Backup for app data, including AsyncStorage query snapshots,
theme preferences, generated app-sandbox PDFs/backups, and SecureStore-backed
auth state. This is the conservative choice because inventory/order/activity
snapshots can be health-adjacent household care data.

The `expo-secure-store` plugin is explicitly configured with
`configureAndroidBackup: true`. If app backup is ever re-enabled later, Expo's
SecureStore backup rules should still exclude SecureStore entries because
Android Keystore keys are not restorable after uninstall/restore.

## Play Data Safety Inventory

Use this as the starting point for the Play Console Data Safety form and the
privacy policy. The owner must still verify the deployed backend, SDK list, and
hosted privacy policy immediately before submission.

| Data area | Examples in CareKosh | Required or optional | Purpose | Stored/transmitted |
|---|---|---|---|---|
| Name | Full name / display name | Required for account setup | Account management, app functionality | Sent to CareKosh API and stored server-side; lightweight auth state in SecureStore |
| Email | Login, verification, password reset, account deletion confirmation | Required | Account management, security, recovery, developer communications for auth emails | Sent to CareKosh API and stored server-side; lightweight auth state in SecureStore |
| Username | Optional username | Optional | Account management, alternate identifier | Sent to CareKosh API if provided; lightweight auth state in SecureStore |
| Phone/contact | No account phone field today; supplier/contact fields may contain phone/email if user enters them | Optional | Inventory management | Sent to CareKosh API as item metadata and may appear in cache/export |
| Password/auth secrets | Password, access token, refresh token | Required for auth | Account security | Password transmitted over HTTPS to API; tokens stored only in SecureStore; passwords not stored by mobile |
| Inventory | Item/category names, descriptions, quantity, stock thresholds, expiry dates, brands, notes, supplier details, purchase links, critical flag | Required for core app use after sign-in | App functionality | Sent to API, stored server-side, displayed from React Query, cached in AsyncStorage display snapshot |
| Orders | Order IDs, order items, quantities, statuses, timestamps, PDF path | Optional; created when user makes orders | App functionality | Sent to API, stored server-side, cached in AsyncStorage display snapshot |
| Categories | Category names, descriptions, colors/icons/order | Required/optional depending user setup | App functionality | Sent to API, stored server-side, cached in AsyncStorage display snapshot |
| Activity | Item/category/order activity feed entries and timestamps | Generated by app/server use | App functionality, user history | Stored server-side and cached as display snapshots |
| Images/photos | User-selected item photo URI and photo content embedded into user-generated PDFs when selected | Optional | App functionality, inventory identification | Library asset chosen by user; item image URI may be sent as item metadata; photo content is processed locally for preview/PDF/export unless backend upload is added later |
| PDF/files | Inventory/order PDFs and JSON backups/exports | Optional and user-initiated | App functionality, data portability | Generated in app sandbox; shared only through user-initiated system share sheet |
| Clipboard export | Inventory JSON copied to clipboard | Optional and user-initiated | Data portability | Written to OS clipboard at user request |
| Diagnostics/crash logs | No app analytics/crash SDK currently; production app console logs are disabled | Not collected by app today | N/A | Google Play/Android platform may provide install/crash vitals outside app code |
| Third-party SDK/platform data | Expo modules, React Native, TanStack Query, Zustand, Render API hosting, Neon database hosting, Google Play distribution | Depends on provider | App functionality, distribution, hosting | Review SDK/provider privacy docs before final Play submission |

Data Safety declarations should state that data is encrypted in transit for
preview and production builds. Local development HTTP is not shipped in preview
or production artifacts.

## Play Reviewer App Access

CareKosh is login-gated. In Play Console > App content > Sign-in details, provide
reviewer access instructions. Suggested text:

```text
CareKosh requires sign-in to inspect the app.

Use the supplied reviewer account:
Email: <reviewer email>
Password: <reviewer password>

If the Render backend is cold-starting, the app may show a short "server waking
up" message. Wait up to 60 seconds and retry sign-in. After login, review these
flows: Dashboard, Inventory, add/edit item, image picker from library, export
inventory PDF, create order and export PDF, receive/apply stock, Profile >
Delete Account.
```

Use a staging-backed preview APK for internal review and a production-backed AAB
only for the Play submission path.

## Privacy Policy, Audience, Rating, And Account Deletion

| Play Console item | Current Goal 9 input |
|---|---|
| Privacy policy URL | Status: drafted but not hosted in existing launch guide. Host a public URL before Play submission and ensure it covers the inventory/order/photo/PDF/cache/token behavior in this document. |
| Target audience | 13+; not directed to children. |
| Content rating | Medical / health-adjacent inventory utility; no violence, sexual content, gambling, ads, UGC social features, or user-to-user communication. |
| Ads declaration | No ads in current mobile dependency/code inventory. |
| Account deletion path | In app: Profile screen > Delete Account sends a confirmation email. Server deletion completes only after email confirmation. Play also requires a public web deletion request URL; publish this with the privacy policy before submission. |
| Permissions rationale | Only explicit permission kept is `ACCESS_NETWORK_STATE`; camera, microphone, overlay, vibration, and legacy broad storage permissions are blocked. |

## Preview Smoke Test Checklist

Run after a preview APK is built from this branch:

- Registration and email-verification pending route.
- Login against staging, including cold-start retry UX if Render is asleep.
- Inventory/category load from server.
- Item create and edit, including selected image from library.
- Inventory PDF export/share, with and without photos.
- Order create/export PDF.
- Receive order and apply stock.
- Logout, then login as another account and confirm stale inventory/order/cache
  data from the prior user is gone.
- Confirm production-like build does not allow cleartext HTTP and does not emit
  sensitive logs.
