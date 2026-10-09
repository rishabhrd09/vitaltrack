# Expo & Play Store Setup Guide

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

> **Status (re-checked 8 October 2026 against the working tree, `03cfebb` plus uncommitted documentation; Expo and Play rules checked against official docs retrieved that day):** branch `feature/backend-hardening-ai-voice-agent-foundation` is not merged; `main` and tag `v1.0.0` are `835fad3`. The feature branch changes what a release must declare: the app now requests the microphone (`RECORD_AUDIO`; the `expo-audio` plugin also adds `MODIFY_AUDIO_SETTINGS`) for the voice assistant, needs `minSdkVersion` 26, and contains a local Android native module, so voice works only in native builds (for example EAS-built APKs), not Expo Go. Expo, Play Console and GitHub dashboard items were not re-checked and are NOT VERIFIED. Earlier note (23 Sept 2026): head `0007`, 152 backend tests — now out of date. Current behaviour: [complete developer guide](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) · [API traceability](API_TRACEABILITY.md) · [voice setup](VOICE_AGENT_SETUP.md) · [documentation home](INDEX.html).

> **Goal:** configure Expo/EAS, wire GitHub Actions, and prepare a Google Play Store release for **CareKosh**.

Related:
- Build triggers & CI: repo-root `CAREKOSH_BUILD_DEPLOY_FLOW.html`
- Deployment strategies: repo-root `CAREKOSH_DEPLOYMENT_STRATEGY.html`
- Roadmap / launch checklist: [../CAREKOSH_ROADMAP.md](../CAREKOSH_ROADMAP.md)
- Android release privacy/platform hardening: [PLAY_STORE_RELEASE_HARDENING_GOAL_9.md](PLAY_STORE_RELEASE_HARDENING_GOAL_9.md)
- Production launch operations runbook: [LAUNCH_READINESS_RUNBOOK_GOAL_10.md](LAUNCH_READINESS_RUNBOOK_GOAL_10.md)

---

## Part 1 — Expo account setup (required for any EAS build)

### 1.1 Create an Expo account (~2 min)

1. Sign up at [expo.dev/signup](https://expo.dev/signup).
2. **Recommendation:** sign up with GitHub (reuses your existing identity, simplifies linking).
3. Authorize Expo for GitHub.

### 1.2 Install CLI and log in

```bash
npm install -g eas-cli
eas login
eas whoami        # should print your username
```

### 1.3 Configure the project

One-time only — links the local code to your Expo project and writes the project ID into `app.json`. CareKosh is already configured (`app.json` has `extra.eas.projectId` and `owner: rishabhrd09`); run this only for a fork under your own Expo account.

```bash
cd vitaltrack-mobile
eas build:configure
# Pick "Android" (or "All" if you will also ship iOS later)
```

**CareKosh EAS profiles** (already defined in `eas.json`):

| Profile | Artifact | `EXPO_PUBLIC_API_URL` | Channel | Use |
|---|---|---|---|---|
| `development` | APK | `http://localhost:8000` | — | Local dev on physical device. `developmentClient: true` is set, but `expo-dev-client` is not installed, so this profile cannot build as configured: Expo requires it, and EAS CLI stops (or offers to install it when interactive). Its `gradleCommand` is `:app:assembleDebug` |
| `preview` | APK | `https://staging-api.carekosh.com` | `preview` | PR review sideload, staging backend |
| `production` | AAB | `https://api.carekosh.com` | `production` · autoIncrement · `resourceClass: medium` | Play Store (track: `internal`) |

`cli.appVersionSource` is `remote`, so EAS keeps the Android `versionCode`; the `versionCode: 1` in `app.json` only seeded it and is not the source of truth. Only the `production` profile auto-increments it. Channels are set, but over-the-air updates are disabled (`updates.enabled: false`), so channels deliver nothing: every JavaScript or native change needs a new APK/AAB.

Android cleartext traffic is disabled by default. `app.config.js` enables it
only for the development EAS profile, an API URL starting with `http://localhost`, or an explicit local-only override (`CAREKOSH_ALLOW_ANDROID_CLEARTEXT=true`). Preview
and production builds are HTTPS-only, and `app.config.js` throws if a preview or production build is given a different non-empty API URL. An empty URL is not caught: the app then falls back to `http://localhost:8000`. The profile, not the Play track, fixes the URL: a production-profile AAB calls `https://api.carekosh.com` on every track, including internal and closed testing.

### 1.4 Create an access token for CI

1. Go to [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens).
2. **Create Token** → name `GitHub Actions` → expiration **None** (set a calendar reminder to rotate annually; the current Expo token options were not re-checked).
3. **Copy the token now** — Expo shows it once.

### 1.5 Save as a GitHub secret

1. Open the repo on GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. **Name:** `EXPO_TOKEN` (exactly).
3. **Value:** the token from 1.4.

The CI job `build-preview` in `.github/workflows/ci.yml` consumes this secret when a PR is labelled `build-apk`.

---

## Part 2 — Dev sanity check before going to the store

With the account wired up, confirm the toolchain works end-to-end:

```bash
cd vitaltrack-mobile
npx expo start --clear
```

| Component | What should happen |
|---|---|
| Local code | Metro waits on `exp://…` |
| Expo Go on phone | Scans QR, loads the app. Each Expo Go build runs one SDK: for this SDK 54 project install the SDK 54 build from [expo.dev/go](https://expo.dev/go); the Play Store version follows the newest SDK |
| Backend | Whatever `EXPO_PUBLIC_API_URL` points at (default: your local backend) |

**Pass conditions:** app boots on phone, you can register, log in, create an item. (Expo Go cannot load the voice assistant's native module on the feature branch; test voice with an EAS-built APK.)

---

## Part 3 — Google Play Console (required for store release)

### 3.1 Developer account ($25 one-time)

1. [play.google.com/console/signup](https://play.google.com/console/signup)
2. Sign in with the Google account that will own publishing.
3. Pay the $25 fee.
4. Complete ID / business verification — **allow 24–48 h**, sometimes longer (an estimate; Google publishes no timing). Start this **early**. For a new personal account, the 14-day closed test (Part 6) is usually the longest step.

### 3.2 Create the app listing

1. **Create app** from the Play Console dashboard.
2. **App name:** `CareKosh` (user-visible). Tagline / category: Medical, free, app (not game).
3. Accept developer program policy declarations.

### 3.3 Complete the listing sections

Every one of these must be complete before Google lets you submit:

| Section | Notes |
|---|---|
| App access | If login is required (it is), provide test credentials and cold-start notes for Google reviewers. Use the template in `PLAY_STORE_RELEASE_HARDENING_GOAL_9.md` |
| Content rating | Questionnaire — pick the category that fits (a "Medical" choice was not found in Google's help pages; check the live form), no violent/adult content |
| **Data safety** | Use `PLAY_STORE_RELEASE_HARDENING_GOAL_9.md` as the data inventory: name, email, username, optional supplier/contact phone, inventory, orders, categories, activity, selected images/photos, PDF/files, clipboard export, diagnostics/crash-log status, and third-party SDK/provider data. Declare encryption-in-transit and account deletion accurately. (7 Oct 2026, feature branch) Re-check before shipping the voice assistant: the app requests the microphone; recordings stay on the phone in default offline mode; separately consented Groq online listening uploads the finished take through the backend after Stop, with temporary-file cleanup after processing/failure; the speech model is downloaded from `download.moonshine.ai` on request (no user data in that request); and the reviewed question text (not inventory, not audio) is sent through the backend to Groq only after Send, only when the on-phone matcher found nothing, and only when the server enables it, the account has consented and the per-device cloud switch is on. Typed or spoken questions can contain sensitive words. The server also stores consent and usage records (`ai_consents`, `ai_usage`). Google's rules: processing that stays on the device need not be declared; short-lived off-device processing must be; transfers to service providers are not "sharing"; apps only on internal testing are exempt, closed/open/production tracks are not. The answers themselves are owner decisions |
| Health apps declaration | Required for every app on closed, open or production tracks, even without health features (Play Help, retrieved 8 Oct 2026) |
| Target audience | 13+ (owner decision; the optional cloud-understanding consent asks users to confirm they are 18+) |
| **Account deletion** | In-app path: Profile → Delete Account → email confirmation. Play also requires a public web deletion request URL that works without the app; host this before submission (the backend's `/auth/confirm-delete/{token}` page only serves emailed links) |
| Assets | Icon 512×512 PNG, feature graphic 1024×500 PNG, ≥2 phone screenshots |
| **Privacy policy URL** | Must resolve publicly (GitHub Pages, Notion public page, or a simple static site work) |

### 3.4 Service account for `eas submit`

Lets `eas submit` (run from your laptop; no CI job runs it) upload a new AAB without a manual browser upload.

The steps below follow the current Expo guide ([expo.fyi/creating-google-service-account](https://expo.fyi/creating-google-service-account)) and Google's Play Developer API docs, retrieved 8 Oct 2026. Earlier text used Play Console's **API Access** page, a Google Cloud role "Service Account User" and **Admin**; linking a Cloud project is no longer needed, and Admin is not needed.

1. In **Google Cloud** (a project you own): create a service account (for example `eas-submit`).
2. **Manage Keys** → **Add Key** → **JSON** → download.
3. Enable the **Google Play Android Developer API** for that project.
4. In Play Console → **Users and permissions**: invite the service account's email and grant the app permissions Expo lists — view app information, edit draft apps, release to production (including Play App Signing), release to testing tracks, manage testing tracks, manage store presence.
5. Save the JSON file as `vitaltrack-mobile/credentials/google-service-account.json`. The `credentials/` folder must be gitignored (already is: `credentials/*.json` in `vitaltrack-mobile/.gitignore`).

---

## Part 4 — Building and submitting

### Preview APK (for internal sideload / PR review)

Two paths — pick one:

**A. From your laptop**
```bash
cd vitaltrack-mobile
eas build --profile preview --platform android
```

**B. Via CI (preferred — no local credentials needed)**
- Open a PR to `main`, add the `build-apk` label.
- The `build-preview` job in CI (Node 22 on the feature branch) runs `eas build --profile preview --platform android --non-interactive --no-wait` and posts a PR comment saying the build was triggered. Because of `--no-wait`, the comment points to the EAS dashboard rather than linking the APK; download it from expo.dev. (Earlier text said the comment links the APK.) The job runs only after both test jobs pass, and while the label stays on the PR every later push, reopen or label change queues another EAS build.

Either way, the artifact is wired to the **staging** backend.

### Production AAB

```bash
cd vitaltrack-mobile
eas build --profile production --platform android
eas submit --profile production --platform android   # uploads to Play Console internal track
```

`eas.json` sets no `releaseStatus`, so EAS creates the internal release as completed and internal testers can get it at once. Recommended (not configured): `releaseStatus: "draft"` to upload without rolling out. This AAB calls `https://api.carekosh.com`, so internal testers use production data.

> **CI automation for this is currently gated off** — `build-production` in `.github/workflows/ci.yml` has `if: false`. Restore the condition noted in its comment, `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`, when Play Console production is live and you want every `main` merge to build an AAB. Note that the job as written only runs `eas build`; it does not call `eas submit`, so uploading to the internal track would still be a separate step.

---

## Part 5 — Sharp edges

| Issue | Impact | Mitigation |
|---|---|---|
| Identity verification delay | Blocks all store progress for 1–3 days (estimate; no official timing) | Start on day one of the launch sprint |
| Asset dimension strictness | 1-pixel rejection on icon / feature graphic | Export from Figma at exact pixel sizes; use 512×512 and 1024×500 templates |
| Privacy policy requirement | Any app with user accounts needs one | Host on GitHub Pages as markdown; link URL in Play Console + in-app About screen |
| Expo token expiration | CI suddenly fails months later | Set expiration to None, or schedule a yearly rotation |
| App signing key loss | Cannot push updates to existing users | Use Play App Signing: Google holds the app signing key; EAS generates the upload key, which Google can reset if it is lost |
| Data Safety declaration errors | Suspension risk | Declare every field the app/backend stores or transmits. Start from `PLAY_STORE_RELEASE_HARDENING_GOAL_9.md`, then re-check the final backend schema and SDK/provider docs before submission |
| Account deletion not reachable | Play rejects submissions with account-deletion problems (enforced since 31 May 2024; earlier text said "instant") | In code: Profile → "Delete My Account" → `DELETE /api/v1/auth/me` → email confirmation (added in PR #13). The public web deletion URL is still needed |
| No over-the-air updates (added 7 Oct 2026) | A bad build stays on phones until users install a new one | `updates.enabled` is `false`; plan each fix as a new AAB/APK |
| Microphone permission wording (added 7 Oct 2026, feature branch) | Reviewers compare what the app says with what it does | The `expo-audio` `microphonePermission` text in `app.json` is used only on iOS; Android shows its standard system dialog. That text mentions optional cloud recognition, which this build does not offer (`CLOUD_VOICE_ENABLED = false`); fix it before any iOS build. Make the in-app explanation and the Data Safety answers match the build you ship |
| Target API level (added 8 Oct 2026) | Since 31 Aug 2026, new apps and updates must target Android 16 (API 36) | Expo SDK 54 / React Native 0.81 default to target 36 and the app overrides only `minSdkVersion`; confirm the value in the built AAB (NOT VERIFIED) |
| 16 KB memory pages (added 8 Oct 2026) | Apps targeting Android 15+ must support 16 KB pages on 64-bit devices; from 1 Feb 2027 non-compliant updates cannot be released | React Native ≥ 0.77 complies; the Moonshine native library must be 16 KB aligned too. `vitaltrack-mobile/scripts/check-moonshine-artifact.cjs` checks the downloaded AAR; check the final build with APK Analyzer or `bundletool` (NOT VERIFIED) |

---

## Part 6 — Launch readiness checklist (current state as of 2026-06-16)

Statuses below are the June 2026 record. Expo, GitHub secrets, Play Console and Render items were not re-checked on 7 or 8 Oct 2026 and are NOT VERIFIED.

| Task | Status |
|---|---|
| Expo account, token in GitHub as `EXPO_TOKEN` | ✅ done |
| `eas.json` profiles for dev / preview / production | ✅ done |
| `build-preview` label-gated CI job | ✅ done |
| `build-production` CI job (currently `if: false`) | 🔴 flip on launch day |
| Play Console developer account | 🟡 paid, ID verification in review |
| App listing (title, icons, screenshots) | 🟡 WIP |
| Privacy policy hosted at a stable URL | 🟡 drafted, not hosted |
| `FRONTEND_URL` env var set on production Render service | ✅ done (`render.yaml` sets `https://api.carekosh.com/api/v1/auth`, so emailed links open the backend's own HTML pages; live value NOT VERIFIED) |
| Goal 9 Play Data Safety input inventory | ✅ documented in `docs/PLAY_STORE_RELEASE_HARDENING_GOAL_9.md` |
| Goal 10/11 launch operations runbook and evidence | ✅ documented in `docs/LAUNCH_READINESS_RUNBOOK_GOAL_10.md` and `docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md` |
| Production monitor provider setup | 🔴 template exists; provider monitors and alert destination not proven yet |
| Data Safety form in Play Console | 🔴 not submitted |
| Closed testing track (≥12 testers opted in continuously for 14 days; required before production access for personal developer accounts created after 13 Nov 2023 — this account's type is NOT VERIFIED; internal testing does not count) | 🔴 not started |
| Voice assistant release review: microphone permission text, Data Safety answers, speech-pack download, `minSdkVersion` 26 (feature branch, added 7 Oct 2026) | 🔴 not started (no PR for the feature branch as of 7 Oct; not re-checked) |
| Target API 36 and 16 KB page-size check on the final AAB (added 8 Oct 2026) | 🔴 not checked (see Part 5) |

See [../CAREKOSH_ROADMAP.md](../CAREKOSH_ROADMAP.md) for the live version of this list.

---

You are ready to build (with `eas-cli` installed as in 1.2; earlier text used `npx eas`, but the npm package `eas` is unrelated — use `npx eas-cli@latest` if you do not install it):
```bash
eas build --profile preview --platform android
```

---

*Original: 2026-04-19. Last reviewed: 2026-06-16 against PR #47. Code facts re-checked 2026-10-07 against `03cfebb` (feature branch); dashboard items not re-checked. Re-checked 2026-10-08 against the working tree and official Expo/Google docs retrieved that day: development profile needs `expo-dev-client`, service-account steps, `npx eas`, Expo Go SDK match, Data safety rules for the voice release, target API 36, 16 KB pages, closed-test rule, iOS-only microphone text.*

> **Re-audit notes (2026-05-04):**
> - Historical note: the original launch-readiness snapshot was written on 2026-04-19. The §6 table above has been refreshed for the merged Goal 9/10/11 work, but the privacy-policy URL, Play Console listing, Data Safety form, closed-testing tester count, and real monitor-provider setup still need operator evidence before submission.
> - The Data Safety enumeration of "fields the backend stores" should additionally declare the email-verification, password-reset, and account-deletion token columns + their expiry timestamps. Those are PII storage touchpoints introduced in PR #12 and PR #13.
> - The `eas.json` profile mappings (development → localhost, preview → staging, production → prod) and the `RENDER_DEPLOY_HOOK` / `EXPO_TOKEN` secret names are unchanged.
> - The mobile cold-start UX layer (added on the audit/cold-start-mutation-ux branch, merged 2026-05-04) is review-relevant for first-touch Play Console reviewers — when Render's free tier cold-starts, the user now sees a "Saving… server warming up" pill plus a centred dialog summarising the outcome. Worth adding a launch checklist row "Cold-start UX verified end-to-end on Render free tier."

> **Goal 9 notes (2026-06-15):**
> - Android production/preview cleartext is disabled through app config; development remains able to use local HTTP.
> - Explicit Android permissions were reduced to `ACCESS_NETWORK_STATE`; camera, microphone, overlay, vibration, and legacy broad storage permissions are blocked unless a future generated manifest proves a feature requires them.
> - (Later, 7 Oct 2026, feature branch only:) the voice assistant un-blocks the microphone. `RECORD_AUDIO` is requested through the `expo-audio` plugin (`recordAudioAndroid: true`, background recording off), the `FOREGROUND_SERVICE*` microphone/media permissions are added to the blocked list, a local plugin removes `expo-audio` background services, and `minSdkVersion` is 26. `main` still blocks `RECORD_AUDIO`.
> - App auto-backup is disabled because AsyncStorage cache snapshots can contain health-adjacent inventory/order/activity data. SecureStore remains configured for Android backup exclusion behavior.

> **Goal 10/11 notes (2026-06-16):**
> - Backup/restore, launch/rollback checklists, monitoring template, log redaction, incident response, and small cold-start/load smoke are now routed through `docs/LAUNCH_READINESS_RUNBOOK_GOAL_10.md` and `docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md`.
> - The repo contains a monitor provider template and evidence placeholders. It does not prove that UptimeRobot, Better Stack, or another provider has live production monitors and alert destinations configured.
> - Production smoke should use a dedicated smoke account. Register and order-apply remain staging synthetic or controlled manual production checks only.
