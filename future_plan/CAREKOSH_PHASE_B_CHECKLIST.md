# CareKosh — Play Console One-Time Setup (Phase B) — Tickable Checklist

> Source: `CAREKOSH_PLAY_STORE_LAUNCH_PLAYBOOK.html` (Phase B + Data Safety / App-access appendices).
> **All of this can be done now, while the EAS build quota resets (~Jul 1).** None of it needs the AAB.
> Ordered by external lead time — do the top group first.

---

## ⏱️ Start first (longest lead time — depends on others)

- [ ] **Google Play Developer account** — $25 one-time **+ ID verification** (can take a few days to clear). *Do this today.*
- [ ] **Host a public Privacy Policy URL** (GitHub Pages / public Notion / any static host). Must cover what CareKosh stores/transmits:
  - name, email, username, optional supplier/contact phone, inventory, orders, categories, activity feed, selected photos, generated PDFs, clipboard export, auth tokens (SecureStore only)
  - processors: **Render, Neon, Brevo, Google Play**
  - → enter in **App content → Privacy policy**; also link it from the in-app About screen.
- [ ] **Host a public "Request account deletion" URL** (alongside the policy) → **App content → Data deletion**. *Missing this = instant rejection.*
  - (In-app Profile → Delete Account already ships; Google additionally requires the **web** URL.)
- [ ] **Recruit ≥ 12 closed-test testers** (the later 14-day clock won't start without 12 opted-in installs on day 1).

---

## 📋 Play Console → App content forms

- [ ] **Create app**: name **CareKosh**, type App, **Free**, accept declarations.
- [ ] **B3 · Data Safety form** — fill from the inventory below. Declare:
  - [ ] **Encrypted in transit** (HTTPS-only; dev HTTP is never shipped)
  - [ ] **Account deletion available**
  - [ ] email-verification / password-reset / account-deletion **token columns + expiry** as server-side PII
  - [ ] *Re-verify against the deployed backend + current SDK list before submitting*
- [ ] **B4 · Content rating** — questionnaire. Category **Medical / health-adjacent utility**; **no** violence, sexual content, gambling, ads, or user-to-user/UGC.
- [ ] **B5 · Target audience & content** — **13+**, *not* directed to children (keeps the Families policy out of scope).
- [ ] **B6 · App access (reviewer sign-in)** — provide a **real** reviewer email + password (create one now on the live backend `api.carekosh.com`). Paste the template below. Rotate the password after review.
- [ ] **B8 · Health apps declaration** (if Play prompts) — truthfully: **not** a medical device, **no** Health Connect access, no medical advice, only user-entered inventory data.

---

## 🖼️ B7 · Store listing & assets (exact specs — 1px off is rejected)

- [ ] App icon — **512 × 512 PNG**
- [ ] Feature graphic — **1024 × 500 PNG**
- [ ] **≥ 2 phone screenshots** — Dashboard, Inventory, item detail, PDF export
- [ ] Short + full descriptions — plain language, **no medical claims**

---

## 🔑 C · Service account JSON (for `eas submit` *after* the first manual upload)

- [ ] Play Console → **Users & Permissions → API access → Create service account** → in Google Cloud make `eas-submit` (role *Service Account User*) → **Manage keys → Add key → JSON → download**.
- [ ] Grant it **Admin** (or "Release to testing tracks") in Play Console.
- [ ] Save to `vitaltrack-mobile/credentials/google-service-account.json` (already gitignored — **never commit**).
- [ ] *Not needed for the first upload (manual, Phase F) — needed for every automated submit after.*

---

## 📎 Copy-paste 1 — Data Safety inventory (fill the form from this)

| Data area | Examples | Req/Opt | Stored / transmitted |
|---|---|---|---|
| Name | Full/display name | Required | API + server-side; light auth state in SecureStore |
| Email | Login, verify, reset, deletion confirm | Required | API + server-side; SecureStore |
| Username | Optional username | Optional | API if provided; SecureStore |
| Phone/contact | Supplier/contact fields if entered | Optional | API as item metadata; may appear in cache/export |
| Password / secrets | Password, access + refresh tokens | Required | Password over HTTPS; tokens **only** in SecureStore; passwords not stored on device |
| Inventory | Item/category names, qty, thresholds, expiry, brands, notes, supplier, links | Required | API, server-side, AsyncStorage display snapshot |
| Orders | IDs, items, qty, statuses, timestamps, PDF path | Optional | API, server-side, cached snapshot |
| Categories | Names, descriptions, colors/icons/order | Req/Opt | API, server-side, cached snapshot |
| Activity | Activity feed entries + timestamps | Generated | Server-side + display-snapshot cache |
| Images/photos | Selected item photo URI; photos in PDFs | Optional | Library asset; processed locally for preview/PDF |
| PDF/files | Inventory/order PDFs, JSON backups | Optional | Generated in app sandbox; shared via system share sheet |
| Clipboard export | Inventory JSON to clipboard | Optional | Written to OS clipboard on request |
| Diagnostics/crash | No analytics/crash SDK; prod console logs off | Not collected | Play/Android platform vitals only |
| Third-party processors | Expo, RN, TanStack Query, Zustand, Render, Neon, Brevo, Google Play | Depends | Review each provider's privacy docs |

---

## 📎 Copy-paste 2 — Reviewer "App access" text

Paste into **Play Console → App content → App access → Sign-in details** (fill in a real reviewer account):

```
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

> Use a dedicated reviewer/smoke account with **fake data only**; rotate the password after review.

---

## ✅ When this is all green
You'll be cleared to go straight from the AAB (once the EAS quota resets ~Jul 1) to:
**First manual upload (Phase F) → Internal-testing smoke (Phase G) → ⛔ Closed testing: 12 testers / 14 continuous days (Phase H) → apply for production access → Production staged rollout.**

The closed-testing window is the ~2-week wall — having 12 testers lined up *before* day 1 is the single most important scheduling move.
