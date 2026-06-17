# Goal — Profile / Account UI Launch Readiness

**Status:** Verified against the codebase (read-only) · ready to implement
**Last reviewed:** 2026-06-18
**Backend work required:** None
**Scope:** `vitaltrack-mobile` only

> This goal was independently verified against the actual code before approval.
> Every claim below (file paths, method signatures, error strings, field names,
> version source, and the absence of hosted legal URLs) was confirmed. The
> grounding references are in [Appendix A](#appendix-a--verified-code-references).

---

## Objective

Make the profile/account area complete and functional for launch by wiring real
Name/Username editing, hiding Settings, making support actionable, and replacing
the current About alert with a real About CareKosh modal/screen.

## Hard rules

- Do not change unrelated app behavior.
- Do not add placeholder or "coming soon" UI.
- Do not expose email editing yet.
- Do not add Change Password, Phone, profile photo upload, notifications,
  language, **Privacy Policy links, Terms links**, or sign-out-other-devices.
- Do not invent new About description copy.
- Preserve the existing About description copy currently used in
  `app/(tabs)/index.tsx`.
- Do not send the whole user object to profile update. Only send `{ name, username }`.

---

## Workstream 1 — Profile sheet cleanup

**Files:** `vitaltrack-mobile/components/common/ProfileMenuSheet.tsx`,
`vitaltrack-mobile/app/(tabs)/index.tsx`

- Remove/hide the Settings row (`ProfileMenuSheet.tsx:243-251`, icon+title at `:244-245`).
- Remove the `onSettings` prop from `ProfileMenuSheet` if no longer used
  (declared `:24`, destructured `:38`).
- Remove the parent stub `onSettings={() => Alert.alert('Settings', 'Settings screen coming soon')}`
  (`index.tsx:297`).
- Keep only: **Edit Profile, About CareKosh, Help & Support, Logout**.
- Replace hardcoded `v2.0.0` (`ProfileMenuSheet.tsx:256`) with
  `Constants.expoConfig?.version ?? '1.0.0'` (mirror the existing pattern in
  `providers/QueryProvider.tsx:7,107`).
- Keep About subtitle format as: `Home ICU Inventory Management · v<version>`.

> Note: the displayed version will correctly change **v2.0.0 → v1.0.0** because
> `app.json` declares `version: "1.0.0"`. This is intended. If 1.0.0 is not the
> intended public version, bump `app.json` separately — do not re-hardcode.

## Workstream 2 — Edit Profile screen

**File:** `vitaltrack-mobile/app/profile.tsx`

- Rename header title from `Profile` to `Edit profile`.
- Add editable text inputs for Name and Username.
- Keep Email read-only.
- Show the email badge **only when** `typeof user?.isEmailVerified === 'boolean'`.
  - boolean `true` → `Verified`; boolean `false` → `Unverified`; `undefined` → omit the badge.
  - Rationale: `isEmailVerified` is optional and is often `undefined` from
    cached/persisted auth state — never infer "unverified" from a missing field.
- Show caption: `To change your email, contact support.`
- Add Save button in the header.
- Disable Save when unchanged, invalid, or saving.

**Validation**
- Name required after trim.
- Username required.
- Username length 3–50.
- Username must match `^[a-z0-9_]+$`.
- Normalize username to lowercase before save.

**Save behavior**
- Call `authService.updateProfile({ name, username })` (`services/auth.ts:52-54`
  → `PATCH /auth/me`; backend updates only non-null fields, `auth.py:892-939`).
- On success, update the Zustand auth user with the returned profile. Prefer the
  existing `updateUser(profile)` merge helper (`store/useAuthStore.ts:363-368`)
  so unrelated user fields are preserved; the screen only reads
  `name`/`username`/`email`/`isEmailVerified`.
- Refresh the badge/user display from the returned profile (it always includes
  `isEmailVerified`, so the screen self-heals after a save).
- Only show an inline username error when **`error.status === 400` and the message
  is exactly `Username already taken`** (`auth.py:928`, surfaced via
  `ApiClientError.message`).
- Do not show 401/session errors as username field errors — a 401 is a session
  event (triggers auto-logout), not a validation failure.
- Preserve the current delete-account flow and plain-language delete copy
  (`profile.tsx:84-137`).

## Workstream 3 — Help & Support

**File:** `vitaltrack-mobile/components/common/HelpSupportDialog.tsx`

- Make **only** `support@carekosh.com` tappable by nesting a `<Text onPress=…>`
  around just the email substring (it currently sits mid-sentence in one `Text`
  node at `:42` — do not wrap the whole sentence).
- Use `Linking.openURL('mailto:support@carekosh.com').catch(() => {})`
  (`Linking` is a standard react-native export already used in
  `components/inventory/ItemRow.tsx:6,59`; import it here).
- Keep the refresh-from-server action (`onRefreshFromServer`, invoked `:45-56`).
- Do not remove the current support purpose text.

## Workstream 4 — About CareKosh

**Files:** `vitaltrack-mobile/app/(tabs)/index.tsx`, new modal/component if useful

- Replace the current native `Alert` (`index.tsx:298`) with a real About modal or
  simple screen.
- Include:
  - CareKosh
  - Home ICU Inventory Management
  - Version from `Constants.expoConfig?.version`
  - Build/version code from `Constants.expoConfig?.android?.versionCode` if
    available (do **not** add `expo-application` — it is not installed)
  - Contact support: `support@carekosh.com`
  - Copyright/footer
- Preserve the existing description copy **exactly**:

  ```
  CareKosh helps family caregivers manage critical medical supplies at home.

  Designed for families caring for loved ones with ALS, MND, stroke recovery, and other conditions requiring home ICU setups.
  ```

- **Do not add Privacy Policy or Terms links until hosted URLs exist.** No
  `carekosh.com/privacy` or `/terms` page exists anywhere in the repo — the docs
  state privacy is "drafted, not hosted" and Terms is not drafted. Shipping those
  links now would be dead links (placeholder UI) and would fail Play review.
  Track hosting them as a separate follow-up.

## Workstream 5 — Remove stale Settings reference

**File:** `vitaltrack-mobile/app/(auth)/forgot-password.tsx`

- Replace the copy at `:101`:
  `Registered with only a username? Log in and add an email in Settings to enable password recovery.`
- Use support-safe copy instead, for example:
  `Registered with only a username? Contact support@carekosh.com for help with password recovery.`
- Do not imply users can add an email in Settings (Settings is being removed).

---

## Verification checklist

- [ ] Profile sheet no longer shows Settings.
- [ ] No visible "Settings screen coming soon" UI remains.
- [ ] Forgot-password screen no longer points users to Settings.
- [ ] Edit Profile saves Name and Username successfully.
- [ ] Duplicate username shows an inline username error.
- [ ] Email remains read-only.
- [ ] Verified badge is **not** falsely shown as Unverified when the cached user
      lacks `isEmailVerified` (badge omitted instead).
- [ ] Support email opens the mail app.
- [ ] About displays real version/build info, support email, the preserved
      description copy, and **no** dead Privacy/Terms links.
- [ ] No hardcoded `v2.0.0` remains in visible UI.

## Definition of done

The profile/account area has only working launch-ready actions, real profile
editing for supported fields, tappable support, accurate version display,
preserved About copy, and no unfinished Settings or dead legal-link surfaces.

---

## Appendix A — Verified code references

These were confirmed by read-only inspection on 2026-06-18.

| Claim | Location |
|---|---|
| Sheet rows (Edit Profile / Settings / About / Help / Logout) | `components/common/ProfileMenuSheet.tsx:233-286` |
| Settings menu item (icon + title) | `ProfileMenuSheet.tsx:244-245` |
| Hardcoded `v2.0.0` in About subtitle | `ProfileMenuSheet.tsx:256` |
| `onSettings` "coming soon" stub | `app/(tabs)/index.tsx:297` |
| `onAbout` alert + existing description copy | `app/(tabs)/index.tsx:298` |
| Real version pattern (`expo-constants`) | `providers/QueryProvider.tsx:7,107` |
| `app.json` version `1.0.0`, versionCode `1` | `vitaltrack-mobile/app.json:5,25` |
| `updateProfile(data: Partial<User>)` → `PATCH /auth/me` | `services/auth.ts:52-54` |
| Backend updates only non-null fields | `vitaltrack-backend/app/api/v1/auth.py:892-939` |
| Duplicate-username error: 400 `Username already taken` | `auth.py:928` |
| `ApiClientError` surfaces `detail` as `message` | `services/api.ts:328-333,394` |
| Username rules `^[a-z0-9_]+$`, 3–50, lowercased | `app/schemas/user.py:128-147` |
| `isEmailVerified` (camelCase alias) returned by API | `app/schemas/user.py:173`; mobile type `types/index.ts:20` |
| Delete-account flow + plain-language copy | `app/profile.tsx:84-137` |
| Support email rendered as plain text | `components/common/HelpSupportDialog.tsx:42` |
| `Linking.openURL(...).catch()` precedent | `components/inventory/ItemRow.tsx:6,59` |
| Stale "add an email in Settings" copy | `app/(auth)/forgot-password.tsx:101` |
| No hosted Privacy/Terms URL anywhere | confirmed via repo-wide grep; docs say "drafted, not hosted" |

## Appendix B — Out of scope (deliberately deferred)

- Email editing (needs a backend re-verification fix first: `PATCH /auth/me` does
  not currently reset `is_email_verified` or send a new verification email).
- Change Password screen.
- Hosting `carekosh.com/privacy` and `/terms`, then adding those links to About.
- Bumping the public app version if `1.0.0` is not intended.
