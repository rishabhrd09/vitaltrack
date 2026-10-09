# CareKosh Mobile

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](../docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md).


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](../docs/BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

> **Status (re-checked 8 October 2026):** Checked against the working tree of branch `feature/backend-hardening-ai-voice-agent-foundation` at `03cfebb` (Expo 54.0.35, React Native 0.81.5, React 19.1.0, TanStack Query 5.101.2 per the lockfile and installed packages). `main` (`835fad3`) does not have the voice assistant, the order `localId`, the `npm test` suites or the `onlineManager` wiring described as "feature branch" below. Re-run on 8 Oct 2026: `npm test` ran 121 tests (all passed), `tsc --noEmit` was clean and ESLint reported 0 errors and 1 warning (3 warnings on 7 Oct; two unused imports were removed). Installed APK/AAB versions on phones are NOT VERIFIED. Earlier note (23 Sept 2026): eight mobile API tests, 152 backend tests — now out of date. Start here: [complete developer guide](../docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) · [API traceability](../docs/API_TRACEABILITY.md) · [documentation home](../docs/INDEX.html) · [voice setup](../docs/VOICE_AGENT_SETUP.md).

> React Native + Expo mobile app for the CareKosh home-ICU medical inventory platform.

[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)
[![TanStack Query](https://img.shields.io/badge/TanStack%20Query-v5-FF4154)](https://tanstack.com/query)

> The directory name `vitaltrack-mobile/` is legacy (CareKosh was formerly VitalTrack). Do not rename — the CI workflow (`.github/workflows/ci.yml`), the setup scripts and the documentation use this path. (Earlier text blamed `eas.json` and Render; neither refers to this folder.)

---

## Quick start

### Prerequisites
- Node.js 22 (`.nvmrc`; 20.19.4 or newer also works — Expo SDK 54 needs it; the CI `test-frontend` job uses 20). `.npmrc` sets `legacy-peer-deps=true`.
- Expo Go **for SDK 54** on your phone, from `expo.dev/go` (the Play Store build follows the newest SDK). It runs everything except the voice assistant's microphone; voice needs the EAS-built `preview` APK because it uses a local native module
- Backend running — see [../vitaltrack-backend/README.md](../vitaltrack-backend/README.md)

### Install & run

```bash
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
```

Scan the QR code with Expo Go. Without `EXPO_PUBLIC_API_URL`, the app calls `http://localhost:8000` (`services/api.ts`).

**Phone can't reach `localhost:8000`?** Either `adb reverse tcp:8000 tcp:8000` (USB; see [USB_ADB_REVERSE_GUIDE.md](../docs/USB_ADB_REVERSE_GUIDE.md)) or set `EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000`. The full walkthrough is [LOCAL_TESTING_COMPLETE_GUIDE.md](../docs/LOCAL_TESTING_COMPLETE_GUIDE.md).

---

## Architecture — server-first, not offline-first

CareKosh was migrated from an offline-first architecture to **server-first** in PR #8 (`refactor/server-first-architecture`). The backend is the single source of truth; the mobile app does **not** maintain an offline queue, does **not** keep domain data as a local source of truth (only a read-only display cache), and does **not** reconcile conflicts on reconnect.

| Concern | How it's handled |
|---|---|
| Server reads | [`@tanstack/react-query`](https://tanstack.com/query) — caching, revalidation, background refresh. Defaults: `staleTime` 30 s, `gcTime` 24 h, `retry` 3, `networkMode: 'offlineFirst'`; refetch on focus (AppState) and, on the feature branch, on reconnect (NetInfo → `onlineManager`) |
| Cache persistence | `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` — read-only snapshot in AsyncStorage for instant launches; auth queries and mutations are never persisted; cleared on logout/login; kill switch in `providers/QueryProvider.tsx` (PR #16) |
| Server writes | TanStack mutations with `retry: 0`. No optimistic cache writes: affected queries are invalidated after the server confirms. Failures show a message with an explicit Retry. (Earlier text said "optimistic UI + rollback"; the code does not do that.) |
| Concurrent edits | Server CAS checks `items.version`. Edit Item retains the version captured with its fields, so a cache refresh cannot silently bypass a stale-save 409. Active queries refetch after conflicts; reopen the form before editing again. Retry retains its original variables. |
| Offline | No write queue and no deferred replay. Most write buttons check NetInfo first and refuse with "Connect to WiFi to …"; profile save, account deletion, logout and the auth screens do not check. Reads show the cached copy (restored only if it was saved within the last 24 hours) with an "Offline" status pill |
| Loading UX | `components/common/SkeletonLoader.tsx` animated placeholders (variants: `dashboard`, `inventory`, `orders`) while first fetch runs |
| Cold start on login | Auto-retry loop against `/health` — 5 s interval, max 12 attempts, Cancel button; triggered when `ApiClientError.status` is `0 / 502 / 503 / 504`; 401/403 never retry |
| UI state | `zustand` — intentionally minimal (~61 lines in `useAppStore.ts`) |
| Auth tokens | `expo-secure-store` (values encrypted with a key held in the Android Keystore); the persisted auth state also lives in SecureStore. The query cache in AsyncStorage is not encrypted |
| Voice assistant (feature branch) | Compact **Ask Care Coach** dock above the tabs; custom Kotlin AudioRecord captures a temporary mono PCM16/16 kHz WAV and provisional Moonshine live captions. Offline final recognition is default; optional Groq Whisper uploads the finished take only with fresh audio opt-in and `groq_audio` consent. Answers and unsaved drafts are built on the phone; only separate touch confirmation saves an order. Preferences are per-account in AsyncStorage (`carekosh-voice-settings-v2:<userId>`). `CLOUD_VOICE_ENABLED=false` disables hosted speech output; `CLOUD_TRANSCRIPTION_ENABLED=true` allows consented online listening. Optional Groq text understanding: only after Send, only when the phone's parser found nothing, the server enables it, and the user has consented and switched it on for that phone, the question text (which may itself contain sensitive words) goes to `POST /api/v1/ai/interpret`. Consent and usage bookkeeping are written to the server database |
| Request timeouts | Ordinary calls: 90 s overall across transport, refresh/retry waits and body parsing. Shorter bounds remain for token refresh (30 s), startup profile check (8 s), health probes and assistant calls (50 s). A timeout does not prove a write failed. |

No `redux-persist`, no AsyncStorage-backed domain state, no `services/sync.ts`, no `useSyncStore`. These were all removed in PRs #4–#8. Cache persistence (PR #16) is a **display-only snapshot** — mutations always go server-first and the cache is never pushed back, making it categorically different from the deleted offline-first architecture.

---

## Project structure

```
vitaltrack-mobile/
├── app/                          # expo-router file-based routing
│   ├── _layout.tsx               # root Stack: (auth), (tabs), item/[id], order/create, builder, profile, search
│   │                             # + assistant (transparent modal, feature branch)
│   ├── assistant.tsx             # voice setup (?mode=settings) and typed practice (feature branch)
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
│   ├── item/[id].tsx             # item detail / edit screen (slides up)
│   ├── order/create.tsx          # new-order screen (feature branch: sends one localId per Save press)
│   ├── builder.tsx               # bulk inventory seed modal
│   ├── profile.tsx               # edit name/username, read-only email, account deletion
│   └── search.tsx                # global-search modal
├── components/                   # UI components
│   ├── assistant/                # AssistantExperience, AssistantDock, AssistantLayer, AnswerList, VoiceSetup
│   ├── common/
│   │   ├── SkeletonLoader.tsx    # animated placeholders (dashboard/inventory/orders variants)
│   │   └── ProfileMenuSheet.tsx  # top-right menu: Edit Profile, Voice setup (feature branch), About, Help & Support
│   ├── dashboard/
│   ├── inventory/
│   └── orders/
├── features/assistant/           # voice policy, preferences, readiness, recording, offline voice, snapshot (feature branch)
├── modules/carekosh-voice/       # local Android Expo module for on-device transcription (feature branch)
├── plugins/withForegroundOnlyAudio.js  # config plugin that removes expo-audio background services (feature branch)
├── providers/
│   └── QueryProvider.tsx         # QueryClient + PersistQueryClientProvider + focusManager (+ onlineManager on the feature branch) + kill switch
├── services/
│   ├── api.ts                    # fetch-based HTTP client with token injection
│   ├── auth.ts                   # register / login / logout / requestAccountDeletion / cancelAccountDeletion / changePassword
│   ├── items.ts / orders.ts / categories.ts
│   └── assistant.ts / assistantSession.ts   # /api/v1/ai client + in-memory assistant session (feature branch)
├── hooks/
│   ├── useServerData.ts          # TanStack Query hooks (reads)
│   ├── useServerMutations.ts     # TanStack mutation hooks (writes)
│   ├── useNetworkStatus.ts
│   ├── useSeedInventory.ts
│   └── useForceSync.ts           # Help & Support "Refresh from server" (refetches items and categories)
├── store/
│   ├── useAuthStore.ts           # auth state, tokens via SecureStore
│   ├── useAppStore.ts            # UI-only state (isInitialized flag)
│   └── useResultDialogStore.ts   # UI-only queue for the save-result dialog
├── tests/                        # node --test suites (*.test.cjs; feature branch)
├── theme/                        # design tokens
├── types/                        # TypeScript types (incl. the phone's isLowStock/isOutOfStock rules)
└── utils/                        # helpers
```

---

## Screens

| Route | Purpose |
|---|---|
| `(auth)/login` | email-or-username login |
| `(auth)/register` | signup — **email is required** (PR #12) |
| `(auth)/forgot-password` | request password reset email |
| `(auth)/reset-password` | set a new password. Reachable only through the deep link `vitaltrack://reset-password?token=…`; the emailed reset link opens the backend's web form instead. A signed-in user is redirected to the tabs. The screen checks only that the new password has 8+ characters (the backend also requires upper case, lower case and a digit) (earlier text said it checked the token length) |
| `(auth)/verify-email-pending` | shown after every registration and when login returns `EMAIL_NOT_VERIFIED`; resend (60 s cooldown) and "I've Verified — Go to Login" |
| `(tabs)/index` | dashboard — counts, needs-attention items and recent activity (20 entries). The counts are computed on the phone from the cached item and order lists (the backend `/items/stats` route is not used), so the phone's low-stock rule and "pending orders" (pending + ordered + received) can differ from the API's |
| `(tabs)/inventory` | category-grouped items and search. There is no quick stock +/- control: quantities change only through the item editor (`PUT /items/{id}` with `version`), applying a received order, or seeding |
| `(tabs)/orders` | order history. Actions offered: "Have you received the order?" (pending → received) and "Update Stock" (apply a received order). "Remove" appears for every status, but the server deletes only pending and declined orders (400 otherwise); `partially_received` shows as "Unknown" |
| `item/[id]` | item detail + editor; sends the version captured with the form values |
| `order/create` | new order from low-stock suggestions |
| `builder` | bulk inventory seed for first-time setup |
| `profile` | edit Name/Username (`PATCH /auth/me` with name and username only; no phone field), read-only email, and **request account deletion** — reached from the top-right profile button's bottom-sheet menu. After a deletion request it polls `GET /auth/me` every 5 s while open, for at most 10 minutes. No change-password or cancel-deletion screen exists |
| `search` | global-search modal route registered in the root stack |
| `assistant` (feature branch) | voice setup (speech-pack download, microphone, spoken replies) and typed practice; the everyday entry is the **Ask Care Coach** dock above the tabs |

---

## Data flow

### Reads (TanStack Query)

```typescript
// hooks/useServerData.ts
export function useItems() {
  return useQuery({
    queryKey: queryKeys.items,
    structuralSharing: false,
    queryFn: async ({ signal }): Promise<Item[]> => {
      const response = await itemService.getAll({ limit: 999 }, signal);
      return response.items;
    },
  });
}
```

`itemService.getAll` with a limit above 100 walks the server's pages of 100 (`GET /api/v1/items?page=…&pageSize=100`) and rejects overlapping or incomplete pages.

### Writes (TanStack mutations; OCC is enforced by the server)

```typescript
// hooks/useServerMutations.ts (abridged)
export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['item-update'],
    mutationFn: ({ id, ...data }) => itemService.update(id, data),   // PUT /items/{id} with `version`
    onSuccess: (data, variables, context) => {
      qc.invalidateQueries({ queryKey: queryKeys.items });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
      dispatchMutationSuccess({ /* toast or result dialog */ });
    },
    onError: (error, variables, context) => {
      dispatchMutationFailure({ error, onRetry: makeRetry(qc, 'item-update', variables) });
    },
    onSettled: reconcileAfterFailure(qc, [queryKeys.items, queryKeys.activities]),
  });
}
```

(8 Oct 2026 safety follow-up: the real screen uses `PUT /items/{id}`; the separate stock `PATCH` hook has no screen caller. `reconcileAfterFailure` now invalidates affected queries on status 0, 502, 503, 504 or 409. Active queries refetch; failure text warns that a missing reply may follow a successful commit. Retry retains the original variables and version. See [API traceability](../docs/API_TRACEABILITY.md).)

### Services

- `services/api.ts` — `fetch`-based HTTP client; injects `Authorization: Bearer <access>` from SecureStore; on 401 runs one shared refresh (`POST /auth/refresh`) and replays waiting requests once; throws `ApiClientError`. A 429 from the auth routes is shown as "wait 60 seconds" (the server sends no `Retry-After`); the login screen says "Too many attempts. Please wait a moment and try again." instead. Ordinary requests have one 90-second overall deadline covering transport, shared-refresh/retry waits and response parsing. AI requests retain their 50-second deadline; shared refresh retains 30 seconds. Credential writes are serialized and stale refresh results cannot replace newer stored credentials.
- `services/auth.ts` — thin wrapper around `api.ts` for auth flows. Exposes `requestAccountDeletion()` (used by the Profile screen) and `cancelAccountDeletion()` and `changePassword()` (no screen calls these two; use the API directly to test them).

### Stores

- `store/useAuthStore.ts` (~423 lines) — user object, auth status, `initialize`/`login`/`register`/`logout`/`updateUser`/`forgotPassword`/`resetPassword` actions. Tokens persisted in SecureStore, **not** AsyncStorage. Registration discards the returned tokens and sends the user to the verification screen; login and logout both clear the query cache (memory and AsyncStorage).
- `store/useAppStore.ts` (~61 lines) — **UI-only state** (`isInitialized` flag). Domain data (items, categories, orders, activity) lives in the TanStack Query cache, not here.

---

## Environment variables

For local development, create a `.env` (EAS builds use the per-profile values in `eas.json` instead; git-ignored `.env` files are not uploaded to EAS):

```env
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000
```

After changing `.env`, reload the app fully (Expo picks up `.env` edits; restart Metro if in doubt). Without any value, `services/api.ts` falls back to `http://localhost:8000`. The `npm run start:local`, `start:staging` and `start:prod` scripts set the variable for that Metro process — but in development a `.env` value overrides theirs (read from the installed Expo SDK 54 code; not tested on a phone), so keep only one source. `start:prod` points a development session at **production** data: use it only for a brief read-only check with a dedicated test account, never for Start Fresh, Replace All, "Update Stock" or account deletion.

### EAS profiles (`eas.json`)

| Profile | `EXPO_PUBLIC_API_URL` | Channel | Artifact |
|---|---|---|---|
| `development` | `http://localhost:8000` | — | APK (`:app:assembleDebug`; `developmentClient: true` is set but `expo-dev-client` is not installed, so EAS CLI stops or offers to install it; never built in this review) |
| `preview` | `https://staging-api.carekosh.com` | `preview` | APK |
| `production` | `https://api.carekosh.com` | `production` | AAB (Play Store `internal` track; `autoIncrement`, remote version source) |

Over-the-air updates are disabled (`updates.enabled: false` in `app.json`), so the channels deliver nothing: every JavaScript or native change needs a new APK/AAB. `app.config.js` refuses preview/production builds pointed at any other API URL (an empty URL is not caught; the app would then fall back to `http://localhost:8000`) and allows cleartext HTTP only for the development profile, a `http://localhost` URL or the explicit `CAREKOSH_ALLOW_ANDROID_CLEARTEXT=true` opt-in. The EAS profile, not the Play track, decides the API URL: any `production`-profile AAB calls `https://api.carekosh.com`. Android package: `com.carekosh.mobile`; `minSdkVersion` 26 on the feature branch.

---

## Development

```bash
npx expo start --clear             # normal (clears Metro cache)
npx expo start --tunnel            # if LAN blocks direct connect

npx tsc --noEmit                   # type check
npm run lint                       # ESLint (0 errors, 1 warning on 8 Oct 2026)
npm test                           # node --test tests/*.test.cjs — 121 tests on the feature branch (re-run 8 Oct 2026)
npx expo-doctor                    # checks Expo config sanity (not installed, npx fetches it; CI ignores its result; it reported patch-version mismatches on 7 Oct, not re-run)
```

CI (`test-frontend`, Node 20) runs `npm install --legacy-peer-deps`, the `carekosh-voice` autolinking check, `tsc --noEmit`, `npm test` and ESLint; the autolinking check and `npm test` exist on the feature branch only.

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

The voice assistant needs one of these native builds: Expo Go does not contain `modules/carekosh-voice`. The module must stay committed (not git-ignored) so EAS uploads it; CI checks that it is autolinked.

### Production AAB
```bash
eas build --profile production --platform android
eas submit --profile production --platform android   # uploads to Play Console internal track
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Network request failed" in the Metro log; login stuck on "CareKosh server is waking up…"; dashboard "Failed to load data" | Backend not reachable — check `EXPO_PUBLIC_API_URL` matches a URL your phone can hit (and that `.env` is not overriding your `start:*` script); try `adb reverse tcp:8000 tcp:8000` |
| "Unable to resolve module" | `rm -rf node_modules && npm install --legacy-peer-deps` |
| Stuck on splash | `npx expo start --clear` |
| Changes not reflecting | Restart Metro with `--clear` |
| 409 / "updated by someone else" when saving an item | OCC working — another device changed the item first. The updated mutation shows the message and invalidates affected active queries for refetch. Retry still keeps the old version. Reopen the editor after the refetch and check current values before saving. Help & Support → "Refresh from server" remains available. |
| "Verify email before login" | PR #12 hardening — complete the verification email; resend from the pending screen. If you signed in with a username, resend fails (422) because it needs the email address: sign in with the email instead |
| "CareKosh server is waking up…" on login | Cold start (PR #16). Auto-retry polls `/health` every 5 s for up to 12 attempts, then tries the login once. Tap Cancel to abort. Free-plan Render services sleep when idle; `render.yaml` declares production on the paid `starter` plan (live plans NOT VERIFIED). |
| "Remove" on an order returns an error | The server deletes only pending and declined orders; the button is shown for every status |
| Voice: "not available in Expo Go" / "needs the Android preview app" | Expected — install the EAS-built `preview` APK; then download the speech pack in Voice setup |
| Dashboard briefly shows old data on launch | Expected — PR #16 cache persistence. `staleTime` (30 s) marks the cache stale, but does not schedule a fetch or guarantee freshness. Disable by flipping `ENABLE_CACHE_PERSISTENCE` to `false` in `providers/QueryProvider.tsx` (a code change: installed apps get it only through a new build, because over-the-air updates are disabled). |

---

For overall architecture, CI/CD, and full deployment flow, see the [complete developer guide](../docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) (main onboarding entry) and the shorter repo-root [CAREKOSH_DEVELOPER_GUIDE.md](../CAREKOSH_DEVELOPER_GUIDE.md).
