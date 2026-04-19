# Expo & Play Store Setup Guide

> **Goal:** configure Expo/EAS, wire GitHub Actions, and prepare a Google Play Store release for **CareKosh**.

Related:
- Build triggers & CI: repo-root `CAREKOSH_BUILD_DEPLOY_FLOW.html`
- Deployment strategies: repo-root `CAREKOSH_DEPLOYMENT_STRATEGY.html`
- Roadmap / launch checklist: [../CAREKOSH_ROADMAP.md](../CAREKOSH_ROADMAP.md)

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

One-time only — links the local code to your Expo project and writes the project ID into `app.json`.

```bash
cd vitaltrack-mobile
eas build:configure
# Pick "Android" (or "All" if you will also ship iOS later)
```

**CareKosh EAS profiles** (already defined in `eas.json`):

| Profile | Artifact | `EXPO_PUBLIC_API_URL` | Channel | Use |
|---|---|---|---|---|
| `development` | APK | `http://localhost:8000` | — | Local dev on physical device |
| `preview` | APK | `https://vitaltrack-api-staging.onrender.com` | `preview` | PR review sideload, staging backend |
| `production` | AAB | `https://vitaltrack-api.onrender.com` | `production` · autoIncrement | Play Store (track: `internal`) |

### 1.4 Create an access token for CI

1. Go to [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens).
2. **Create Token** → name `GitHub Actions` → expiration **None** (set a calendar reminder to rotate annually).
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
| Expo Go on phone | Scans QR, loads the app |
| Backend | Whatever `EXPO_PUBLIC_API_URL` points at (default: your local backend) |

**Pass conditions:** app boots on phone, you can register, log in, create an item.

---

## Part 3 — Google Play Console (required for store release)

### 3.1 Developer account ($25 one-time)

1. [play.google.com/console/signup](https://play.google.com/console/signup)
2. Sign in with the Google account that will own publishing.
3. Pay the $25 fee.
4. Complete ID / business verification — **allow 24–48 h**, sometimes longer. Start this **early**; it is the longest pole in the launch checklist.

### 3.2 Create the app listing

1. **Create app** from the Play Console dashboard.
2. **App name:** `CareKosh` (user-visible). Tagline / category: Medical, free, app (not game).
3. Accept developer program policy declarations.

### 3.3 Complete the listing sections

Every one of these must be complete before Google lets you submit:

| Section | Notes |
|---|---|
| App access | If login is required (it is), provide test credentials for Google reviewers |
| Content rating | Questionnaire — pick "Medical", no violent/adult content |
| **Data safety** | Declare: name, email, device identifiers. Declare storage location (Neon / Singapore), encryption-in-transit, user-deletable (point to in-app account deletion — see PR #13) |
| Target audience | 13+ |
| **Account deletion** | Link to in-app deletion instructions. CareKosh ships `DELETE /auth/me` and the Profile screen's Delete Account button (PR #13) — Play Store requires this |
| Assets | Icon 512×512 PNG, feature graphic 1024×500 PNG, ≥2 phone screenshots |
| **Privacy policy URL** | Must resolve publicly (GitHub Pages, Notion public page, or a simple static site work) |

### 3.4 Service account for `eas submit`

Lets CI (or your laptop) upload a new AAB without a manual browser upload.

1. Play Console → **Users & Permissions** → **API Access**.
2. **Create new service account** → follow the Google Cloud link.
3. In **Google Cloud**: create a service account named `eas-submit`, role **Service Account User**.
4. **Manage Keys** → **Add Key** → **JSON** → download.
5. Back in Play Console: click **Done**, find the new email, **Manage Play Console permissions**, grant **Admin** (or specifically "Release to testing tracks").
6. Save the JSON file as `vitaltrack-mobile/credentials/google-service-account.json`. The `credentials/` folder must be gitignored (already is).

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
- Open a PR, add the `build-apk` label.
- The `build-preview` job in CI runs `eas build --profile preview --platform android` and posts a link to the APK.

Either way, the artifact is wired to the **staging** backend.

### Production AAB

```bash
cd vitaltrack-mobile
eas build --profile production --platform android
eas submit --profile production --platform android   # uploads to Play Console internal track
```

> **CI automation for this is currently gated off** — `build-production` in `.github/workflows/ci.yml` has `if: false`. Flip it to `if: github.ref == 'refs/heads/main'` when Play Console production is live and you want every `main` merge to publish to the internal track.

---

## Part 5 — Sharp edges

| Issue | Impact | Mitigation |
|---|---|---|
| Identity verification delay | Blocks all store progress for 1–3 days | Start on day one of the launch sprint |
| Asset dimension strictness | 1-pixel rejection on icon / feature graphic | Export from Figma at exact pixel sizes; use 512×512 and 1024×500 templates |
| Privacy policy requirement | Any app with user accounts needs one | Host on GitHub Pages as markdown; link URL in Play Console + in-app About screen |
| Expo token expiration | CI suddenly fails months later | Set expiration to None, or schedule a yearly rotation |
| App signing key loss | Cannot push updates to existing users | Use "Let Google manage app signing"; let EAS generate and Google hold |
| Data Safety declaration errors | Suspension risk | Declare every field the backend stores (users: name, email, hashed password, username, last_login; plus inventory and order data) |
| Account deletion not reachable | Instant Play Store rejection on new apps (2024+) | Verified: `DELETE /auth/me` + Profile screen Delete button ship in PR #13 |

---

## Part 6 — Launch readiness checklist (current state as of 2026-04-19)

| Task | Status |
|---|---|
| Expo account, token in GitHub as `EXPO_TOKEN` | ✅ done |
| `eas.json` profiles for dev / preview / production | ✅ done |
| `build-preview` label-gated CI job | ✅ done |
| `build-production` CI job (currently `if: false`) | 🔴 flip on launch day |
| Play Console developer account | 🟡 paid, ID verification in review |
| App listing (title, icons, screenshots) | 🟡 WIP |
| Privacy policy hosted at a stable URL | 🟡 drafted, not hosted |
| `FRONTEND_URL` env var set on production Render service | ✅ done |
| Data Safety form | 🔴 not started |
| Closed testing track (≥12 testers, 14 days) | 🔴 not started |

See [../CAREKOSH_ROADMAP.md](../CAREKOSH_ROADMAP.md) for the live version of this list.

---

You are ready to build:
```bash
npx eas build --profile preview --platform android
```
