# CareKosh → Google Play Store: Complete Launch Playbook

> **Purpose:** One self-contained guide that takes CareKosh from "preview APK tested, branch merged to `main`" all the way to a **production release on the Google Play Store**, covering every build step, every Google Play testing requirement, every policy/compliance form, and the operational checks/rollback plan.
>
> **Created:** 2026-06-21. **Verified against:** real `eas.json`, `app.json`, `app.config.js`, backend `app/main.py`, repo git state, and official Expo + Google Play documentation.
>
> This playbook **consolidates and supersedes for launch-day purposes** the content you were told to read:
> - `docs/EXPO_AND_PLAY_STORE_GUIDE.md` (Expo/EAS + Play Console setup)
> - `docs/PLAY_STORE_RELEASE_HARDENING_GOAL_9.md` (privacy, permissions, Data Safety inventory, reviewer text)
> - `docs/LAUNCH_READINESS_RUNBOOK_GOAL_10.md` (backend deploy, env vars, monitoring, rollback)
> - `docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md` (evidence log to fill in)
>
> Where those docs and the real config ever disagree, **the config wins** and the difference is flagged in this guide.
>
> **Updated 2026-06-29 (verified against current Google Play Help):** added two newly-enforced gates this playbook originally predated — the **Financial features declaration** (mandatory for *every* app since Oct 30 2025; blocks all updates account-wide until submitted) and the **Health apps declaration** (a health-adjacent app like CareKosh is in scope). See **§B9–B11**. Also re-verified: Expo SDK 54 targets **API 36**, which exceeds Play's **API 35** minimum for new apps — **no target-API action needed**. Identity/D-U-N-S unchanged (D-U-N-S is organizations-only; personal accounts use gov-ID, already done). The new "Android developer verification" program does **not** enforce in India until 2027+ — ignore for this launch.

---

## Table of Contents

1. [Reality check: where you are and how long this really takes](#1-reality-check)
2. [Ground-truth facts about YOUR project (verified)](#2-ground-truth-facts)
3. [The one decision to make before anything else: the package name](#3-package-name-decision)
4. [Pre-flight: sync your local repo](#4-pre-flight-sync)
5. [Phase A — Accounts & tooling](#5-phase-a-accounts--tooling)
6. [Phase B — Google Play Console one-time setup (all policy forms)](#6-phase-b-play-console-setup)
7. [Phase C — Service account key for `eas submit`](#7-phase-c-service-account)
8. [Phase D — Verify the production backend is live](#8-phase-d-backend)
9. [Phase E — Build the production AAB](#9-phase-e-build)
10. [Phase F — First upload to Play (must be manual)](#10-phase-f-first-upload)
11. [Phase G — Internal testing smoke](#11-phase-g-internal-testing)
12. [Phase H — Closed testing: the mandatory 12-tester / 14-day gate](#12-phase-h-closed-testing)
13. [Phase I — Apply for production access](#13-phase-i-production-access)
14. [Phase J — Production release with staged rollout](#14-phase-j-production-release)
15. [Phase K — Post-release verification & monitoring](#15-phase-k-post-release)
16. [Rollback & incident response](#16-rollback)
17. [Appendix 1 — Copy-paste command cheat sheet](#appendix-1-commands)
18. [Appendix 2 — Google Play policies that apply to CareKosh](#appendix-2-policies)
19. [Appendix 3 — Full Data Safety inventory (fold into the Play form)](#appendix-3-data-safety)
20. [Appendix 4 — Play reviewer "App access" text template](#appendix-4-reviewer-text)
21. [Appendix 5 — Master readiness checklist (current status)](#appendix-5-checklist)
22. [Appendix 6 — Sharp edges & gotchas](#appendix-6-gotchas)

---

<a name="1-reality-check"></a>
## 1. Reality check: where you are and how long this really takes

**Where you are (status refreshed):** Backend pre-launch hardening is **merged + deployed + verified live** (PR #54; details in `docs/CAREKOSH_BACKEND_AUDIT_REPORT.html`). The mobile package is renamed to `com.carekosh.mobile` (PR #53), the preview APK is built and device-tested ✅, and Render is on the always-on **Starter** plan (no more free-tier cold starts). The **production AAB is the current blocker**: the EAS free-tier Android build quota is used up this month and **resets ~Jul 1** — re-run the build then. After that, the remaining work is **almost entirely Google Play Console setup + a mandatory testing window**, not more app building.

**The single biggest time cost** is not technical. Because CareKosh will ship from a **personal** Google Play developer account, Google requires a **closed test with at least 12 testers, opted in for 14 continuous days**, before you can even *apply* for production access. That is a hard ~2-week minimum that cannot be shortened. Plan around it.

**Realistic end-to-end order:**

```
Preview APK tested (DONE)
   ↓
Decide package name (now — permanent after first upload)
   ↓
Accounts: Expo/EAS + Play Console $25 + ID verification   (ID check: 1–3 days, sometimes more)
   ↓
Play Console one-time setup: privacy policy, data safety, content rating,
   account deletion URL, store listing, reviewer login                 (a few hours of forms)
   ↓
Service-account key for eas submit  +  verify prod backend is live
   ↓
Build production AAB  →  FIRST upload MANUALLY to Internal testing
   ↓
Internal testing smoke (you + a couple of trusted devices)
   ↓
CLOSED testing: 12 testers, 14 continuous days            ← the mandatory wall, ~2 weeks
   ↓
Apply for production access  (Google reviews the application)
   ↓
Production release with STAGED rollout (e.g. 10% → 50% → 100%)
   ↓
Post-release monitoring + rollback plan ready
```

**Start the two slow things first, in parallel, today:** (a) Play Console **ID verification**, and (b) **hosting the privacy policy + account-deletion URL**. Everything else can happen while those bake.

---

<a name="2-ground-truth-facts"></a>
## 2. Ground-truth facts about YOUR project (verified)

These were read directly from your files — trust these over any older doc.

| Fact | Value | Source |
|---|---|---|
| App display name | **CareKosh** | `app.json` `expo.name` |
| Android package / applicationId | **`com.carekosh.mobile`** ✅ renamed in PR #53 (permanent once published) | `app.json` `android.package` |
| Marketing version | `1.0.0` | `app.json` `expo.version` |
| versionCode | **Auto-managed by EAS** — `autoIncrement: true` + `appVersionSource: "remote"`. The literal `versionCode: 1` in `app.json` is **not** the shipped value and is never edited by hand. | `eas.json`, `app.json` |
| Store build profile | **`production`** → builds an **AAB** (`buildType: "app-bundle"`), API URL `https://api.carekosh.com` | `eas.json` |
| Submit profile | **`production`** → uploads to the Play **`internal`** track, key path `./credentials/google-service-account.json` | `eas.json` |
| Signing | **Not pre-configured** → first `eas build` prompts you to let **EAS generate a keystore**; use **Play App Signing**. | no `credentials.json` in repo |
| Cleartext HTTP | **Disabled** for preview & production; allowed only for `development`. Production build *throws* if pointed at any URL other than `https://api.carekosh.com`. | `app.config.js` |
| Android permissions | Only `ACCESS_NETWORK_STATE` (+ auto `INTERNET`). Camera/mic/overlay/vibrate/legacy-storage are **blocked**. | `app.json`, Goal 9 doc |
| Auto-backup | `allowBackup: false` (inventory/order data can be health-adjacent) | `app.json` |
| Backend health URLs | `GET /live` → always `200 {status:"healthy", database:"not_checked"}`; `GET /health` → `200 {…database:"connected"}` when DB up, **`503` `unhealthy/unavailable`** when DB down | `vitaltrack-backend/app/main.py` |
| Production CI build | **Disabled** (`build-production` has `if: false`). All production build + submit is **manual/local**. | `.github/workflows/ci.yml` |

> ⚠️ **Two things to internalize from this table:**
> 1. `eas submit --profile production` lands on the **internal** track, *not* production. Promotion to closed/production is a **manual Play Console** step.
> 2. The production AAB **bakes in `https://api.carekosh.com`**. If that host is not live and healthy at build time, the build is invalid. Verify it (Phase D) before building.

---

<a name="3-package-name-decision"></a>
## 3. Package name — already decided ✅

Your Android applicationId is **`com.carekosh.mobile`** — renamed from `com.vitaltrack.mobile` in **PR #53 (merged)** to match the brand. This decision is **done**; nothing left to choose here.

- **Once you upload the first AAB to Play, this package name is permanent forever.** It cannot be changed; you would have to publish a brand-new app listing and lose your install base, reviews, and URL.
- `com.carekosh.mobile` is what every build now ships (`app.json` `android.package`).

**The id is locked in. Everything after the first upload assumes `com.carekosh.mobile`.**

---

<a name="4-pre-flight-sync"></a>
## 4. Pre-flight: sync your local repo

All launch-relevant work is already merged into `main` and deployed: **PR #53** (package rename) and **PR #54** (backend pre-launch hardening) are both squash-merged. Make sure your local `main` is clean and synced before any release work:

```bash
cd /Users/rishabh/courses_tutorials/vital_track/goal_9_fresh/vitaltrack
git checkout main
git pull --ff-only origin main
git status --short --branch          # expect: clean, up to date with origin/main
git rev-parse HEAD main origin/main  # all three should match
```

Optional housekeeping (delete local copies of already-merged branches):
```bash
git branch -d fix/backend-prelaunch-hardening 2>/dev/null || true
```

> **Do NOT build another preview APK.** You already tested it; that was the staging build. The next build you make is the **production AAB**.

---

<a name="5-phase-a-accounts--tooling"></a>
## 5. Phase A — Accounts & tooling

### A1. Expo / EAS account + CLI
```bash
npm install -g eas-cli
eas login
eas whoami        # should print your Expo username (owner: rishabhrd09)
```

If the project was never linked to EAS on this machine (one-time):
```bash
cd vitaltrack-mobile
eas build:configure       # choose Android
```
(Your `app.json` already has `extra.eas.projectId`, so this is usually already done.)

### A2. Google Play Developer account ($25, one-time) — **start the ID check today**
1. Go to **play.google.com/console/signup**.
2. Sign in with the Google account that will **own publishing** (this is permanent — choose carefully).
3. Pay the **$25** one-time fee.
4. Complete **identity / address verification**. **This is the longest pole** — allow **1–3 days**, sometimes longer. You cannot publish until it clears, so start it before everything else.

> Per your repo's current status, the developer account is "paid, ID verification in review." Confirm it has cleared before Phase F.

---

<a name="6-phase-b-play-console-setup"></a>
## 6. Phase B — Google Play Console one-time setup (all policy forms)

In Play Console, **Create app** → name **`CareKosh`**, type **App** (not game), **Free**, default language, and accept the developer program declarations. Then complete every section below. Google will **not** let you release until all required ones are green.

### B1. Privacy policy URL (required) — 🔴 currently drafted, NOT hosted
- Host a **publicly resolvable** privacy policy (GitHub Pages, a Notion public page, or any static host).
- It must accurately describe what CareKosh stores/transmits: **name, email, username, optional supplier/contact phone, inventory, orders, categories, activity, selected photos, generated PDFs, clipboard export, auth tokens (SecureStore only), and the third-party processors** (Render hosting, Neon database, Brevo email, Google Play distribution).
- Paste the URL into **Play Console → App content → Privacy policy** *and* link it from the in-app About screen.

### B2. Account deletion (required for apps with accounts) — 🔴 web URL must be hosted
- **In-app path already ships:** Profile → Delete Account → email confirmation; server deletion completes only **after** the user confirms by email (`DELETE /auth/me`, PR #13).
- **Google also requires a public web "request account deletion" URL.** Host it alongside the privacy policy and enter it under **App content → Data deletion**. Missing this = instant rejection for new apps.

### B3. Data safety form (required) — 🔴 not submitted
- Fill it from **[Appendix 3](#appendix-3-data-safety)** of this playbook (the full inventory is reproduced there so you do not have to flip between docs).
- Declare **data encrypted in transit** (preview & production are HTTPS-only; local dev HTTP is never shipped).
- Declare that **users can request account deletion**.
- **Before you submit it**, re-verify against the *deployed* backend schema and the current third-party SDK list — Data Safety mistakes are a suspension risk. Note specifically (per Goal 9 re-audit): also declare the **email-verification, password-reset, and account-deletion token columns + their expiry timestamps** as PII storage touchpoints.

### B4. Content rating (required)
- Complete the questionnaire. Category: **Medical / health-adjacent utility**.
- Answers: **no** violence, sexual content, gambling, ads, or user-to-user communication/UGC.

### B5. Target audience & content (required)
- Target audience: **13+**. Not directed to children (so the Families policy / extra child-privacy obligations do not apply).

### B6. App access — reviewer sign-in (required, because login is mandatory) — 🔴 use real creds
- CareKosh is login-gated, so Google reviewers need a working account.
- Provide a **real reviewer email + password** (not a placeholder) plus the cold-start note. Use the exact template in **[Appendix 4](#appendix-4-reviewer-text)**.
- Create this as a dedicated **production smoke account** (see Phase G); rotate its password after the review.

### B7. Store listing & assets (required)
| Asset | Spec |
|---|---|
| App icon | **512 × 512** PNG (exact — 1px off is rejected) |
| Feature graphic | **1024 × 500** PNG (exact) |
| Phone screenshots | **≥ 2** (more is better; show Dashboard, Inventory, item detail, PDF export) |
| Short + full description | Plain-language; medical/household-inventory utility; no health *claims* |

### B8. Health apps note
CareKosh is a household **inventory/care-supply tracker**, not a medical device and it makes **no diagnostic/treatment claims**. If Play prompts a **Health apps declaration** during submission, answer truthfully: it does not access Health Connect, does not provide medical advice, and stores only user-entered inventory data. Do not overstate it as a medical product.

### B9. Financial features declaration (🔴 NEW — mandatory for *every* app since Oct 30 2025)
- **This is the #1 silent blocker.** Since **Oct 30, 2025**, Google requires a **Financial features declaration on every app — even apps with no financial features at all.** Until you submit it, Google **blocks all updates to your app(s), account-wide.**
- For CareKosh, answer **"My app doesn't provide any financial features."** You still **must submit** the form — leaving it blank silently blocks releases.
- Location: **App content → Financial features.**
- *Verified 2026 against Google Play Help (answer/16550159, answer/13849271).*

### B10. Health apps declaration (🔴 NEW — mandatory; CareKosh is in scope)
- Google now requires a **Health apps declaration form** for published apps (including testing tracks), and a **health-adjacent** app like CareKosh is in scope — so this is **not** optional anymore (supersedes the "if prompted" framing in B8).
- Answer **truthfully**, same posture as B8: CareKosh **does not access Health Connect**, provides **no medical advice/diagnosis**, and stores only **user-entered care-supply inventory**. Declare minimal/no health-app categories accordingly; do **not** present it as a medical device.
- Expect it may add a little extra review time. Location: **App content → Health apps** (or prompted at submission).
- *Verified 2026 against Google Play Help (answer/14738291).*

### B11. Other App-content declarations (quick, but required)
- **Advertising ID:** CareKosh shows no ads and collects **no advertising ID** → declare **"No"**.
- **Government apps:** CareKosh is **not** a government app → declare accordingly.
- Both live under **App content** and must be green before release.

---

<a name="7-phase-c-service-account"></a>
## 7. Phase C — Service account key for `eas submit`

This lets your laptop (or CI later) upload AABs without a browser. It is a **local secret file, not a code change.**

1. **Play Console → Users & Permissions → API access** → **Create new service account** → follow the **Google Cloud** link.
2. In **Google Cloud**: create a service account named **`eas-submit`**, role **Service Account User**.
3. **Manage keys → Add key → JSON → download.**
4. Back in **Play Console**: click **Done**, find the new service-account email, **Manage Play Console permissions**, and grant **Admin** (or at minimum **Release to testing tracks**).
5. Save the downloaded file **exactly** here:
   ```
   vitaltrack-mobile/credentials/google-service-account.json
   ```
   The `credentials/` folder is **already gitignored** — never commit this file.

> Without this file, `eas submit` will fail. (It is fine to skip it for the *first* upload, which must be manual anyway — see Phase F — but you need it for every automated submit after that.)

---

<a name="8-phase-d-backend"></a>
## 8. Phase D — Verify the production backend is live (before building)

The production AAB hardcodes `https://api.carekosh.com`. Confirm it is live, healthy, and configured **before** you build.

### D1. Health checks
```bash
curl https://api.carekosh.com/live      # expect 200  {status:"healthy",  database:"not_checked"}
curl https://api.carekosh.com/health    # expect 200  {status:"healthy",  database:"connected"}
```
- `/health` returns **503** (`unhealthy` / `unavailable`) if the DB probe fails.
- On Render's free tier a **first** request after idle can take ~1 minute (cold start). Retry 2–3 times; only **sustained** failure is a real problem.

### D2. Production Render env vars present (from the Goal 10 runbook)
Confirm these exist on the **production** Render service:
`DATABASE_URL`, `SECRET_KEY`, `ENVIRONMENT=production`, `CORS_ORIGINS`, `REQUIRE_EMAIL_VERIFICATION=true`, `MAIL_PASSWORD` (Brevo key), `MAIL_FROM`, `FRONTEND_URL`.

> If `api.carekosh.com` is **not** yet pointed at the live production backend (your Goal 10 evidence verified a Render `*.onrender.com` host), resolve the custom-domain mapping first — otherwise the AAB ships pointing at a dead host. Config wins: the build *will* use `api.carekosh.com` regardless.

---

<a name="9-phase-e-build"></a>
## 9. Phase E — Build the production AAB

Only after: package-name decided ✔, Play Console basics done ✔, backend healthy ✔.

```bash
cd vitaltrack-mobile
npm install --legacy-peer-deps     # local tooling only (RN peer-dep quirk); EAS builds in the cloud from package-lock.json
npx expo-doctor                    # sanity check the project
eas whoami                         # confirm logged in (eas login if not)
eas build --profile production --platform android
```

What happens:
- Produces a **Play-ready AAB**, with `EXPO_PUBLIC_API_URL=https://api.carekosh.com` baked in.
- **First build only:** EAS prompts for signing — choose **"Let EAS generate a keystore"** and keep **Play App Signing** enabled. EAS holds the upload key; Google holds the app signing key. Never lose track of this — losing the key means you can't update the app.
- **versionCode:** do **nothing**. `autoIncrement: true` + remote versioning bumps the build number on EAS's servers automatically every build. Only bump the human-facing **`version`** (`"1.0.0"`) in `app.json` when you want a new marketing string — optional, not required per release.

After it finishes, **download the AAB** from the EAS build page (you need the file for Phase F).

### E1. Permissions spot-check (Goal 9 gate)
Before uploading, inspect the generated AAB's manifest. Expect **only** `ACCESS_NETWORK_STATE` + `INTERNET` (and, if the image picker pulls one in, a single user-photo media permission). If anything unexpected appears (camera, mic, broad storage), stop and investigate before uploading.

---

<a name="10-phase-f-first-upload"></a>
## 10. Phase F — First upload to Play (must be MANUAL)

> **Critical Google Play API limitation (verified with Expo docs):** the **very first** Android upload for a new app **cannot** be done via the API/`eas submit`. You must upload it **manually** through the Play Console once. After that first manual upload, `eas submit` works for all future releases.

**First upload (manual):**
1. Play Console → **CareKosh** → **Testing → Internal testing** → **Create new release**.
2. **Upload** the AAB you downloaded in Phase E.
3. Add release notes, **Save**, then **Review release** → **Start rollout to Internal testing**.

**Every release after this one** can use:
```bash
cd vitaltrack-mobile
eas build --profile production --platform android
eas submit --profile production --platform android   # → lands on the INTERNAL track (per eas.json)
```
Remember: `eas submit` here only reaches the **internal** track. Promotion to closed/production is always a manual Console step (Phases H–J).

---

<a name="11-phase-g-internal-testing"></a>
## 11. Phase G — Internal testing smoke

Internal testing is for **you and a few trusted devices** to confirm the production build actually works against the production backend. (Note: internal testing does **not** count toward the 12-tester/14-day requirement — that must be *closed* testing, Phase H.)

1. In Internal testing, add your own Google account as a tester; open the opt-in link; install from Play.
2. Create **one production smoke account** (small fake data only — one category, one item; never real patient/caregiver/supplier data). Store its creds in your password manager as `CAREKOSH_SMOKE_IDENTIFIER` / `CAREKOSH_SMOKE_PASSWORD`.

**Smoke checklist (run on a real Android device):**
- [ ] App installs and launches from Play internal testing
- [ ] Register → **email-verification** pending route works
- [ ] Login (handle Render cold-start "server waking up" gracefully)
- [ ] Inventory / categories load from the **production** backend
- [ ] Create + edit an item, including a **photo from the library**
- [ ] **Inventory PDF export** + share (with and without photos)
- [ ] **Order** create / export PDF / receive / apply stock
- [ ] Profile / About screen renders
- [ ] **Logout**, then log in as a *second* account → confirm the first user's cached inventory/orders are **gone** (no shared-device leakage)
- [ ] (Optional) Account deletion path: Profile → Delete Account → email confirm
- [ ] Confirm no cleartext HTTP and no sensitive logs in a production build

---

<a name="12-phase-h-closed-testing"></a>
## 12. Phase H — Closed testing: the mandatory 12-tester / 14-day gate

> **This applies to you** because the publisher is a **personal** developer account created after **Nov 13, 2023**. (Organization accounts, or personal accounts created before that date, are exempt — if that's you, skip to Phase J.)

**The rule (verified with Google Play support docs):**
- Run a **Closed test** (not internal) with **at least 12 testers** who **opt in** and **stay opted in for 14 continuous days**.
- The 12-tester minimum was reduced from 20 on **Dec 11, 2024**; the 14-day duration is unchanged.
- Only after meeting this can you **apply for production access**.

**How to run it:**
1. Play Console → **Testing → Closed testing** → create a track (e.g. "Alpha") and an **email list** of testers.
2. Recruit **≥12 real testers** (friends, family, communities, or a reputable testing group). They must each:
   - accept the opt-in link, **install** the app, and **remain opted in** for the full 14 days.
3. Promote your build to the closed track (promote the internal release, or `eas submit` then promote in Console).
4. Keep the build **live and installed** for the testers across the **14 continuous days** — don't remove them mid-window or the clock can reset.
5. Encourage real usage and collect feedback; fix anything blocking, ship updates (each `eas build` auto-bumps the version code).

> Practical tip: line up your 12 testers **before** you start the window so day 1 actually has 12 opted-in installs. The clock is unforgiving.

---

<a name="13-phase-i-production-access"></a>
## 13. Phase I — Apply for production access

After the closed-testing requirement is satisfied:
1. Play Console → **Dashboard** (or the production-access prompt) → **Apply for production access**.
2. Answer Google's short questionnaire about your testing and your app.
3. Google reviews the application (this can take a few days). You cannot create a production release until it's granted.

While waiting, make sure **every** App-content section from Phase B is green (privacy policy, data safety, content rating, target audience, app access, data deletion).

---

<a name="14-phase-j-production-release"></a>
## 14. Phase J — Production release with staged rollout

1. Build/submit the final AAB if you changed anything since closed testing:
   ```bash
   cd vitaltrack-mobile
   eas build --profile production --platform android
   eas submit --profile production --platform android   # lands on internal; then promote in Console
   ```
2. Play Console → **Production** → **Create new release** → add the AAB (or **promote** the tested closed-testing release straight to Production — preferred, since it's the exact build your testers used).
3. Add release notes.
4. **Set a staged rollout percentage** — this is a **manual Console choice** (your `eas.json` has no rollout config). Recommended for a first launch:
   - **Start at 10–20%**, watch Android vitals + your backend for a day or two.
   - Increase to **50%**, then **100%** if crash-free rate and `/health` stay clean.
5. **Review release → Start rollout to Production.**
6. Google does a final production review before it goes live to the rollout percentage.

---

<a name="15-phase-k-post-release"></a>
## 15. Phase K — Post-release verification & monitoring

**Immediately after rollout (from the Goal 10 runbook):**
```bash
curl https://api.carekosh.com/live      # 200, database:"not_checked"
curl https://api.carekosh.com/health    # 200, database:"connected"
```
- [ ] Render **Events** show the latest deploy live; **Logs** show no repeated startup/DB/secret errors
- [ ] **Neon** dashboard: no unusual connection/compute errors
- [ ] **Brevo** dashboard: no unexpected auth/bounce spike (email path healthy)
- [ ] Play Console: production testers/users can install the expected (auto-incremented) version
- [ ] Real-device smoke on the production track (use the smoke account, fake data only)

**Set up uptime monitors** (Goal 10 runbook — currently 🔴 not proven). Use `docs/monitoring/carekosh-uptime-monitors.example.yml` as the template in UptimeRobot / Better Stack:
- Production `/live`: every 5 min, alert after 2 consecutive failures (also keeps the free Render service warm).
- Production `/health`: every 5 min, alert after 2 consecutive failures (DB readiness).
- Staging `/live` + `/health`: every 10 min during launch.

**Cold-start note:** Render free instances spin down after ~15 min idle; the first request can take ~1 min. If real users depend on the app, **consider a paid Render instance** or accept the cold-start risk explicitly (Goal 9 flags this as a pre-launch decision).

**Record evidence** in `docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md`: branch/clean status, `/live` + `/health` outputs, smoke output paths, monitor links — **never** tokens, passwords, DB URLs, or user emails.

---

<a name="16-rollback"></a>
## 16. Rollback & incident response

**Roll back the backend if** (Goal 10 runbook):
- `/live` fails **>2 consecutive** external checks after deploy, or
- `/health` fails and Neon/Render logs show a deploy-caused DB readiness failure, or
- smoke-account login or inventory list fails due to server errors.

**Do NOT roll back for:** a known free-tier cold start that recovers, a single credential typo, or a Play review/opt-in delay.

**Backend rollback procedure:**
1. Render service → **Events** → select the last known-good deploy → **Rollback**.
2. Render disables auto-deploys on rollback (prevents the bad commit redeploying) — keep them off until the fix lands.
3. Verify `/live`, `/health`, smoke login, inventory list.
4. **Render rollback does NOT roll back Neon data.** If a data mutation caused the incident, use the backup/restore runbook in `docs/LAUNCH_READINESS_RUNBOOK_GOAL_10.md` and get explicit approval before any production restore.

**Mobile bad-release recovery** (there is **no** true Play rollback for already-installed users):
1. **Pause/halt the staged rollout** in Play Console.
2. Build a **fixed AAB with a higher version code** (`eas build` auto-increments).
3. Upload to internal → smoke on a real device → promote only after app access, Data Safety, login, inventory, and cold-start are verified.
4. Keep the backend **compatible** with the bad version while users may still have it installed.

---

<a name="appendix-1-commands"></a>
## Appendix 1 — Copy-paste command cheat sheet

```bash
# 0. Sync onto clean main
cd /Users/rishabh/courses_tutorials/vital_track/goal_9_fresh/vitaltrack
git checkout main && git pull --ff-only origin main && git status --short --branch

# 1. Tooling
npm install -g eas-cli
eas login && eas whoami

# 2. Verify production backend BEFORE building
curl https://api.carekosh.com/live
curl https://api.carekosh.com/health

# 3. Build the production AAB
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo-doctor
eas build --profile production --platform android
#   → download the AAB from the EAS build page

# 4. FIRST upload: MANUAL in Play Console → Internal testing (Google API limitation)

# 5. Every later release:
eas build  --profile production --platform android
eas submit --profile production --platform android   # → internal track; promote in Console

# 6. Post-release verify
curl https://api.carekosh.com/live
curl https://api.carekosh.com/health
```

**Track promotion (all manual in Play Console):**
`Internal testing → Closed testing (12 testers / 14 days) → apply for production access → Production (staged rollout %)`

---

<a name="appendix-2-policies"></a>
## Appendix 2 — Google Play policies that apply to CareKosh

Every item below is a Google Play **requirement** for your app. Tick each before submitting for production.

- [ ] **Developer identity verification** completed (personal account).
- [ ] **Privacy policy** hosted at a public URL and entered in App content.
- [ ] **Account deletion**: in-app path **and** a public web deletion-request URL.
- [ ] **Data safety** form completed and accurate (see Appendix 3).
- [ ] **Content rating** questionnaire completed (Medical, no violence/ads/UGC).
- [ ] **Target audience** set to 13+ (not directed to children).
- [ ] **App access** (reviewer login) provided with real credentials (Appendix 4).
- [ ] **Financial features declaration** submitted — answer **"no financial features"** (🔴 mandatory since Oct 30 2025; blocks ALL updates account-wide until done).
- [ ] **Health apps declaration** submitted — truthful (no Health Connect, no medical claims).
- [ ] **Advertising ID** declaration (No) **+ Government apps** declaration completed.
- [ ] **Permissions**: only `ACCESS_NETWORK_STATE` (+ `INTERNET`); justify any media permission the picker adds.
- [ ] **App signing**: Play App Signing enabled (EAS-generated upload key).
- [ ] **App Bundle (.aab)** used for upload (not APK) — your `production` profile already does this.
- [ ] **Target API level**: Expo SDK 54 targets a current Android API level that meets Play's latest requirement for new apps — confirm the value in the build output; if Google flags it, it's a config bump, not a rewrite.
- [ ] **Health apps declaration** (if prompted): answered truthfully — no medical claims, no Health Connect.
- [ ] **Closed testing** (12 testers / 14 days) completed → production access granted.

---

<a name="appendix-3-data-safety"></a>
## Appendix 3 — Full Data Safety inventory (fold into the Play form)

> Reproduced from `docs/PLAY_STORE_RELEASE_HARDENING_GOAL_9.md` so you can fill the form from this one file. **Verify against the deployed backend + current SDK list before submitting.** Declare **encrypted in transit** and **account deletion available**.

| Data area | Examples in CareKosh | Required/Optional | Purpose | Stored / transmitted |
|---|---|---|---|---|
| Name | Full / display name | Required | Account management | Sent to API, stored server-side; light auth state in SecureStore |
| Email | Login, verification, password reset, deletion confirm | Required | Account mgmt, security, recovery, auth emails | Sent to API, stored server-side; light auth state in SecureStore |
| Username | Optional username | Optional | Account mgmt / alt identifier | Sent to API if provided; light auth state in SecureStore |
| Phone/contact | No account phone; supplier/contact fields may hold phone/email if entered | Optional | Inventory metadata | Sent to API as item metadata; may appear in cache/export |
| Password/auth secrets | Password, access + refresh tokens | Required | Account security | Password over HTTPS; tokens **only** in SecureStore; passwords not stored on device |
| Inventory | Item/category names, qty, thresholds, expiry, brands, notes, supplier, links, critical flag | Required (post sign-in) | App functionality | Sent to API, server-side, cached as AsyncStorage display snapshot |
| Orders | IDs, items, quantities, statuses, timestamps, PDF path | Optional | App functionality | Sent to API, server-side, cached snapshot |
| Categories | Names, descriptions, colors/icons/order | Required/optional | App functionality | Sent to API, server-side, cached snapshot |
| Activity | Activity feed entries + timestamps | Generated by use | History | Server-side + display-snapshot cache |
| Images/photos | User-selected item photo URI; photos embedded in user PDFs | Optional | Inventory ID | Library asset; URI may be item metadata; processed locally for preview/PDF |
| PDF/files | Inventory/order PDFs, JSON backups/exports | Optional, user-initiated | Data portability | Generated in app sandbox; shared only via system share sheet |
| Clipboard export | Inventory JSON copied to clipboard | Optional, user-initiated | Data portability | Written to OS clipboard on request |
| Diagnostics/crash | No app analytics/crash SDK; prod app console logs disabled | Not collected by app | N/A | Play/Android platform may provide install/crash vitals outside app code |
| Third-party processors | Expo, React Native, TanStack Query, Zustand, **Render** (hosting), **Neon** (DB), **Brevo** (email), **Google Play** (distribution) | Depends | Functionality, hosting, distribution | Review each provider's privacy docs before submitting |

**Also declare** (Goal 9 re-audit): the **email-verification, password-reset, and account-deletion token columns** and their **expiry timestamps** are server-side PII storage touchpoints.

---

<a name="appendix-4-reviewer-text"></a>
## Appendix 4 — Play reviewer "App access" text template

> Paste into **Play Console → App content → App access → Sign-in details**, filling in a real reviewer account. (From Goal 9 doc.)

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

Use a **production-backed AAB** for the Play submission path and a dedicated reviewer/smoke account with **fake data only**. Rotate the password after review.

---

<a name="appendix-5-checklist"></a>
## Appendix 5 — Master readiness checklist (current status)

Status carried over from your repo docs (`EXPO_AND_PLAY_STORE_GUIDE.md` §6 + Goal 10). Update as you go.

| Item | Status |
|---|---|
| Expo account + `EXPO_TOKEN` in GitHub | ✅ done |
| `eas.json` dev/preview/production profiles | ✅ done |
| Preview APK built + device-tested | ✅ done (you) |
| `FRONTEND_URL` set on production Render | ✅ done |
| Goal 9 Data Safety inventory documented | ✅ (Appendix 3) |
| Goal 10 runbook + evidence | ✅ documented |
| Backend pre-launch hardening (PR #54) | ✅ merged + deployed (see audit report §03) |
| Package name (`com.carekosh.mobile`) | ✅ done — renamed in PR #53 |
| Play Console developer account | 🟡 paid, ID verification in review |
| App listing (title, icons, screenshots) | 🟡 WIP |
| Privacy policy hosted at stable URL | 🔴 drafted, not hosted |
| Web account-deletion URL hosted | 🔴 not hosted |
| Data Safety form submitted in Play Console | 🔴 not submitted |
| Reviewer (App access) credentials | 🔴 placeholder → make real |
| Financial features declaration (no financial features) | 🔴 NEW — required before any release/update (Oct 30 2025) |
| Health apps declaration | 🔴 NEW — required (health-adjacent app) |
| Service-account JSON placed in `credentials/` | 🔴 not created |
| Production backend live + healthy on `api.carekosh.com` | ✅ verified (`/live` + `/health` green) |
| Uptime monitors live (UptimeRobot/Better Stack) | 🔴 template only |
| Cold-start mitigation (paid Render / keep-warm) | ✅ done — Render **Starter** (always-on) |
| Production AAB built | 🔴 blocked — EAS free build quota used; resets ~Jul 1 |
| First manual upload (Internal testing) | ⬜ Phase F |
| Closed testing (≥12 testers, 14 days) | 🔴 not started |
| Production access granted | ⬜ Phase I |
| Production staged rollout | ⬜ Phase J |

Legend: ✅ done · 🟡 in progress · 🔴 blocking, not done · ⬜ upcoming step.

---

<a name="appendix-6-gotchas"></a>
## Appendix 6 — Sharp edges & gotchas

| Gotcha | Why it bites | What to do |
|---|---|---|
| **Package name is permanent** | Can't rename after first upload | Decide in Phase 3, before Phase F |
| **First upload must be manual** | Google Play API blocks API for the first release | Upload the AAB by hand to Internal testing once; `eas submit` works after |
| **`eas submit` → internal track only** | Profile is *named* production but `track: internal` | Promote internal→closed→production manually in Console |
| **AAB bakes `api.carekosh.com`** | Build throws if URL wrong; ships dead host if domain not live | Verify Phase D before building |
| **versionCode is remote/auto** | Editing `app.json versionCode:1` does nothing | Leave it; EAS auto-increments |
| **Signing key loss** | Can't update the app ever again | Use Play App Signing; let EAS generate + Google hold |
| **ID verification delay** | Blocks all publishing 1–3 days | Start day one |
| **Asset pixel strictness** | 1px off = rejected | Export icon 512×512, feature 1024×500 exactly |
| **Closed-test clock resets** | Drop below 12 testers / remove build mid-window | Line up 12 testers up front; keep build live 14 continuous days |
| **Render free-tier cold start** | First request ~1 min; can look like an outage | Retry; add `/live` monitor as keep-warm; consider paid tier |
| **Expo token expiry** | CI fails months later | Set expiry None or schedule yearly rotation |

---

*End of playbook. Sources: repo files (`eas.json`, `app.json`, `app.config.js`, `app/main.py`, `.github/workflows/ci.yml`), repo docs (`EXPO_AND_PLAY_STORE_GUIDE.md`, `PLAY_STORE_RELEASE_HARDENING_GOAL_9.md`, `LAUNCH_READINESS_RUNBOOK_GOAL_10.md`, `LAUNCH_READINESS_EVIDENCE_GOAL_10.md`), and official Expo + Google Play documentation. No application code was modified to produce this guide.*
