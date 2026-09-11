# CareKosh → Google Play: Launch Playbook

> **Rewritten July 2026**, reorganised around **where you actually stand** — not where you started.
> The readable edition is [`CAREKOSH_PLAY_STORE_LAUNCH_PLAYBOOK.html`](CAREKOSH_PLAY_STORE_LAUNCH_PLAYBOOK.html); this file mirrors it.
>
> **State:** `com.carekosh.mobile` v1.0.0 · app status **Draft (never reviewed)** · this release ships **no AI**.
>
> **Supersedes the previous phase-ordered edition**, which had two sections both numbered "Appendix 6",
> stale 🔴 markers on completed work, a wrong "~2 week" timeline, and staged-rollout advice that does not
> apply to a *first* production release.

**Evidence grades used throughout — nothing is asserted without saying how it was checked:**

| Grade | Meaning |
|---|---|
| `[REPO]` | Read from your source files. Re-checkable in seconds. |
| `[LIVE]` | Observed over the network — the URL was actually fetched. |
| `[DASH]` | Lives in a dashboard outside the repo. **You must confirm it; I cannot.** |
| `[CLAIM]` | Established by research, not quoted verbatim from a Google page. Plan around it; re-verify before it costs you something. |

---

## Contents

0. [Stop — five things that can bite you this week](#00-stop)
1. [You are here](#01-you-are-here)
2. [The calendar, as gates](#02-calendar)
3. [Action 1 — clear App content, get out of Draft](#03-app-content)
4. [Action 2 — create the service-account key](#04-service-account)
5. [Action 3 — the first Closed (Alpha) release](#05-alpha-release)
6. [Action 4 — who actually counts as a tester](#06-who-counts)
7. [Action 5 — recruit 12 without risking your account](#07-recruit)
8. [Action 6 — the 14-day lookback](#08-lookback)
9. [Action 7 — the production-access application](#09-production-access)
10. [Action 8 — the first production release](#10-production-release)
11. [Action 9 — the first 48 hours](#11-first-48)
12. [If something goes wrong](#12-when-wrong)
13. [Release 2 and beyond](#13-release-2)
14. [Already settled — the compact record](#14-settled)
15. [This release ships no AI](#15-no-ai)
16. [Appendices A–G](#appendices)

---

<a name="00-stop"></a>
## 0. Stop — five things that can bite you this week

### 1 · Your production email may be going to a sandbox
`MAIL_SERVER` is **never set in `render.yaml`**, so it falls back to the Mailtrap *sandbox* default in `app/core/config.py`. `[REPO]`
If the Render dashboard does not override it, email verification never arrives — **and the account-deletion confirmation link your public page promises Google is never sent.** Account deletion is a Play requirement, so this is a rejection risk.

**Do now:** confirm `MAIL_SERVER`, `MAIL_PASSWORD` and `SENTRY_DSN` in the Render dashboard `[DASH]`, then register a throwaway account and check the email actually arrives.

### 2 · You cannot recruit testers yet — a link sent today is wasted
App status is **Draft**. While in Draft, the closed-testing opt-in link does not exist. `[CLAIM]`
"0 testers opted in" is **not** a recruitment failure — nobody *can* opt in. Build the roster during the review wait (§7); distribute nothing until published.

### 3 · Your internal testers may be disqualified from closed testing
Anyone who opted into internal testing is **ineligible** for closed testing, and removing them from the list does **not** undo it. `[CLAIM]` Audit that list before counting on those people. Remediation in §6.

### 4 · `eas submit` cannot run today
`vitaltrack-mobile/credentials/google-service-account.json` **does not exist** — only a README is there — yet `eas.json` points at it. `[REPO]` Does not block manual upload; blocks all automation. Fix in §4.

### 5 · Render legacy workspaces auto-migrate 1 August 2026
Included bandwidth reportedly drops 100 GB → 25 GB with overage billing; your service is on a legacy plan. `[CLAIM]` Check your egress in the Render dashboard.

---

<a name="01-you-are-here"></a>
## 1. You are here

Past setup, inside the testing gauntlet, but the clock that gates production has not started. Your remaining personal workload is small — most of what is left is queueing behind Google.

| Item | State | Waiting on |
|---|---|---|
| Developer account, ID verified | ✅ Done | — |
| App created in Play Console | ✅ Done | — |
| Store listing · icon · feature graphic | ✅ Done | — |
| Legal pages live at carekosh.com `[LIVE]` | ✅ Done | — |
| Backend healthy on api.carekosh.com `[LIVE]` | ✅ Done | — |
| Reviewer account `reviewer@carekosh.com` | ✅ Done | — |
| Production AAB built + uploaded manually | ✅ Done | — |
| Internal testing + device smoke test | ✅ Done | — |
| **App status** | 🔴 Draft app | **You** — nothing reviewed yet |
| **App content declarations** | 🟡 In progress | **You** — §3 |
| **Service-account key** | 🔴 Not created | **You** — §4 |
| **Closed testing "Alpha"** | 🔴 Inactive · 5 tasks | **You** — §5 |
| **Testers opted in** | 🔴 0 of 12 | Blocked by Draft status |
| 14-day lookback | ⬜ Not started | Blocked upstream |
| Production access | ⬜ Not applied | Blocked upstream |
| Uptime monitors | 🔴 Template only | **You** — §11 |
| AI features | ⬜ Deferred | By decision — §15 |

### Three console messages that look alarming and are not

| What you see | What it means |
|---|---|
| "Draft app" | Google's definition: *"your app has no presence on Google Play."* Internal testing does not clear it — internal is the one track exempt from review. It clears when your first **closed** release is approved. |
| `com.carekosh.mobile (unreviewed)` | The cosmetic side of the same fact. Self-clears ~48h after the first reviewed release publishes. |
| "No deobfuscation file associated" | Cosmetic. Crash traces just won't be symbolicated. Blocks nothing. |

---

<a name="02-calendar"></a>
## 2. The calendar, as gates

| Waiting on | What | Duration |
|---|---|---|
| **You** | Clear App content, create service-account key, configure Alpha, create release | 1–2 days |
| **Google** | **First closed-release review.** Nothing installs during this | ≤ 7 days |
| **You** | Opt-in link goes live → distribute in one coordinated wave | 1 day |
| **You** | **Hold ≥12 eligible testers opted in.** Drive engagement, log feedback, ship 1–3 updates | 14 days |
| **Google** | Production-access application review | ≤ 7 days |
| **You** | First production release — **all-or-nothing**, no rollout percentage | 1 hour |
| **Google** | Final app review | ≤ 7 days |

**Realistic total: 3–3.5 weeks minimum**, mostly waiting. Plan review and testing as **additive, not overlapping** — the opt-in link does not exist during review, so nothing accumulates while you wait. `[CLAIM]`

> *Correction: the previous edition claimed a "~2-week hard minimum" in one place and 3–3.5 weeks in another. The 2-week figure was wrong and has been removed.*

**Use the review wait deliberately** — it is exactly when you recruit testers (§7), draft production-access answers (§9), and stand up monitoring (§11).

---

<a name="03-app-content"></a>
## 3. Action 1 — clear App content, get out of Draft

> **Where it lives:** "App content" is *not* a top-level menu item. It's under your app's **Dashboard → "Finish setting up your app"**. Do not go to *Developer account → Developer profile* — that's account-level branding, separate and optional. `[CLAIM]`

Do them in this order (Target audience depends on others being answered first):

| # | Form | Your answer |
|---|---|---|
| 1 | **Privacy policy** | `https://carekosh.com/privacy-policy` `[LIVE]` — the extensionless path. The `.html` form 307-redirects. |
| 2 | **Ads** | No ads. |
| 3 | **App access** | All functionality behind login → reviewer credentials. Paste-block in [Appendix D](#appendix-d). |
| 4 | **Content rating** | Category **"All other app types"**. No to every question → Everyone / PEGI 3 / IARC 3+. `[REPO]` |
| 5 | **Target audience** | Adults (18+). Not child-directed. |
| 6 | **Data safety** | Full inventory in [Appendix C](#appendix-c). Deletion URL `https://carekosh.com/account-deletion` `[LIVE]` |
| 7 | **Government apps** | No. |
| 8 | **Financial features** | "My app does not have any financial features." **Must still be submitted.** |
| 9 | **Health apps** | Declare truthfully: CareKosh is an **inventory tracker**, not a health app. |
| 10 | **News apps** | No. |
| 11 | **COVID-19 contact tracing** | No. |
| 12 | **Advertising ID** | Not used. Confirm against the merged manifest — command in [Appendix A](#appendix-a). |

> ⚠️ **Two forms people skip, and both block publishing.**
> **Financial features** — the name sounds irrelevant to an inventory app, so it gets ignored. Mandatory for *every* app; silently blocks rollout.
> **Health apps** — required of all published apps including test tracks. Do **not** wait to be prompted. `[CLAIM]`
> *The previous edition contradicted itself: §B8 said "if Play prompts" while §B10 said Google requires it. §B10 was right; merged.*

> 🚨 **Keep every word away from "medical".** Play forces an *Organization* account (D-U-N-S required) for Medical apps. CareKosh is a household **supply-inventory** tracker and is not one — but that's Google's judgement call, and it would surface *after* your 14 days.
> - Store category stays **House & Home** (Tools/Productivity also fine). Never Medical or Health & Fitness.
> - Listing copy says "track what you have", never "manage your medication".
> - The Health apps declaration and the store category are **two different fields**.
>
> *The previous edition listed the category four different ways across four sections. This is the settled answer.* `[REPO]`

### Store listing limits

| Asset | Requirement |
|---|---|
| App name | ≤ 30 chars — replaces `com.carekosh.mobile (unreviewed)` |
| Short description | ≤ 80 chars |
| Full description | ≤ 4,000 chars |
| Icon | 512×512 PNG, 32-bit with alpha, ≤ 1024 KB |
| Feature graphic | 1024×500, no alpha |
| Phone screenshots | **2–8 required**, 320–3840 px per side |
| Tablet screenshots | Not enforced for a phone-only app `[CLAIM]` |

> **Screenshot ↔ reviewer alignment rule:** every feature shown in a screenshot must be reachable by the reviewer with the demo account. "Listing promises something the reviewer cannot reach" is a documented rejection cause and hits login-gated apps disproportionately. Available screens: **Dashboard, Inventory, Orders** (tab titles verbatim), plus item detail, order create, builder, search, profile. `[REPO]`

---

<a name="04-service-account"></a>
## 4. Action 2 — create the service-account key

`eas.json` points at `credentials/google-service-account.json`, which **does not exist**. `[REPO]` Until you create it, `eas submit` fails.

1. **Google Cloud Console** → project → *IAM & Admin → Service Accounts* → **Create service account** (e.g. `carekosh-play-publisher`).
2. On it → **Keys → Add key → Create new key → JSON**. Save as `vitaltrack-mobile/credentials/google-service-account.json`.
3. **Play Console → Setup → API access.** Link the Cloud project. *(The previous edition's navigation here was outdated.)*
4. **Play Console → Users and permissions → Invite new users.** Paste the service account's email. **This invitation is what grants upload rights** — not any Google Cloud IAM role. *(The previous edition told you to grant `roles/iam.serviceAccountUser`; that does not grant Play upload permission.)*
5. **Least privilege:** grant only **"Release apps to testing tracks"** at app level. Do not give account-level Admin to a CI key.
6. **Confirm it's gitignored** — command in [Appendix A](#appendix-a).

> 🔐 This key is a publishing credential. If it leaks, someone can push releases to your app. Never commit it, never paste it anywhere, rotate on suspicion.

---

<a name="05-alpha-release"></a>
## 5. Action 3 — the first Closed (Alpha) release

### First, identify which kind of track "Alpha" is
Closed testing → **Manage track**. **Does a "Countries/regions" tab exist?**
- **Yes** → default closed track; everything below applies.
- **No** → an *additional* closed track: no country targeting, no device-compatibility data, and the standard opt-in URL form is undocumented. **Copy the opt-in link from the Testers tab only** — never hand-construct it. `[CLAIM]`

### Clear the five pending tasks

1. **Countries/regions.** Closed tracks sync to Production by default — and on a new app Production has no countries, which can resolve to *nothing*. **Unsync countries/regions → Edit countries**, select generously: India plus every country your testers' **Play account** is registered in (targeting keys off the registered account country, not physical location). `[CLAIM]`
2. **Testers — pick ONE mode.** Email list *or* Google Group; mutually exclusive, cannot be mixed. **Use the email list.** A Google Group adds a silent failure: a pending, unaccepted invitation is not membership, so that person was never a tester and you're never told.
3. **Feedback channel.** A real email — it shows on the opt-in page, and the production application asks how you collected feedback.
4. **Create the release.** Releases tab → **Create new release** → **Add from library**, pick the AAB already on internal. *Do not rebuild.* Release notes inside the `<en-US>` tags.
5. **Preview and confirm.** Expand "Errors summary" via **Show more**, clear every *error*. Warnings don't block. Then **Start rollout to Closed testing**.

> 🚨 **Then go to Publishing overview and click "Send for review".** Google does not auto-submit. A large share of "stuck for days" reports are an unsubmitted change sitting in that queue. Confirm you see **"Changes in review"**. `[CLAIM]`

> ⚠️ **Then freeze the console.** Google counts the review SLA *from the last submitted change*. One screenshot tweak on day 3 sends you back to the end of the queue.

### If it comes back rejected
- The app drops back to **Draft**, killing the opt-in link again. Warn any testers already lined up.
- Your *internal* track also loses instant-publish until the next approval.
- **Nothing resubmits itself** — fix, then Publishing overview → Send for review.
- Repeated rejections can escalate. Don't treat it as a cheap first attempt.

**Four documented rejection causes to pre-empt:** demo credentials that don't work; a privacy policy that's unreachable or mismatched; a Data safety declaration contradicting observable behaviour; functionality the reviewer cannot reach.

---

<a name="06-who-counts"></a>
## 6. Action 4 — who actually counts as a tester

> 🚨 **The trap you are standing in.** Internal testing is currently **Active** and you smoke-tested on your own device. Google's rule: *a user who opts into your app's internal test is no longer eligible to receive an open or closed test.* `[CLAIM]`
>
> Anyone still on that internal list — **including you** — silently receives nothing from Alpha and never counts. No error, no notification. You'd discover it when testers say "I don't see the app."
>
> **Remediation, before distributing anything:**
> 1. List everyone on the internal tester list.
> 2. Have each open the *internal* opt-in URL and explicitly **opt out**. Removing them from the list does **not** do this.
> 3. Ask for a screenshot confirming opt-out.
> 4. Treat your own account as permanently burned — recruit 12 *other* people.

### What a valid tester looks like

| Requirement | Why |
|---|---|
| A real physical Android phone | Emulators don't count and add risk |
| An established personal Google account | Not a Gmail created this week |
| The **exact** address you added to the list | A phone signed into a different account registers nothing, silently |
| Installed **from the Play Store** via the opt-in link | A sideloaded APK is invisible to Google — zero credit |
| Not currently an internal tester of this app | See above |
| Stays opted in and keeps it installed | Uninstalling may reset their recorded period `[CLAIM]` |

> **Do not trust the dashboard counter alone.** It's a rough guide, and with multiple tester lists it only reports the first. Keep your own spreadsheet: name, exact Google account, source, date confirmed installed, running streak. Ask for a screenshot of the app's home screen — that proves it installed under the right account, the one failure you can't otherwise see.

---

<a name="07-recruit"></a>
## 7. Action 5 — recruit 12 without risking your account

Do this **during the review wait**. Target **18–20 commitments, not 12** — dropout runs 30–50%.

> 🚨 **The asymmetry, stated once.** A rejected release costs a week. A **terminated developer account** costs the $25, the permanent package name `com.carekosh.mobile`, and the ability to publish under that identity — and Google's enforcement policy states related accounts are also permanently suspended, with any replacement terminated too, without refund. `[CLAIM]`

### The four absolutes
1. **Never fabricate Google accounts** to pad the count — not yours, not family burners. This is the highest-probability suspension vector for a solo dev under deadline pressure.
2. **Never pay, gift or UPI your recruits.** Incentivised installs are a named prohibited pattern.
3. **Never buy testers.** A cheap gig buys addresses that opt in once; engagement is what gets graded.
4. **Never share Play Console access.**

> ✅ **Reassurance:** I went looking for a Play policy prohibiting reciprocal tester exchange between developers, and **there isn't one**. The ratings/reviews/installs policy is scoped to placement manipulation; misrepresentation is scoped to concealing identity. The realistic downside of exchange testers is a *production-access rejection for non-engagement*, not suspension. Account-level risk lives on the paid and fabricated paths only.

### Where to recruit

| Tier | Source | Target | Notes |
|---|---|---|---|
| 1 | Your own network — family, college batch group, colleagues | 5–6 | Highest retention. One-to-one on WhatsApp, never broadcast. Lead with *"do you have an Android phone?"* |
| 2 | Your own audience — LinkedIn, X, communities you belong to | 3–4 | Indian dev communities on LinkedIn respond well to a specific ask |
| 3 | Reciprocal developer communities | **cap at ~5** | Test 3–4 others' apps *before* posting. Capped deliberately |
| 4 | Paid services | **0** | See the four absolutes |

> ⚠️ **Two channels struck after checking.** Both look free and are not:
> - ~~`testers-community@googlegroups.com`~~ — the funnel for a commercial vendor with a paid tier plus a credit economy. Posting is owner/manager-only anyway.
> - ~~TestHive Discord~~ — a coin-based tester marketplace. Same product class this guide tells you to decline.

**Reddit:** `r/TestersCommunity` and `r/AndroidClosedTesting` are corroborated by a first-hand developer report but could not be verified directly. **Open them yourself and read the rules before planning headcount around them.** The first shares a name with that vendor — check whether it's vendor-operated. For `r/androiddev`, use the weekly thread only.

**Why Tier 3 is capped:** exchange testers are developers whose own Play accounts may be terminated, and Google won't explain how it links accounts.

### The recruiting message

```
[Closed Testing] CareKosh — household medicine & medical-supply tracker (India) — 14 days, will reciprocate

Solo dev here. CareKosh tracks the medicines and supplies a household actually has — what's in the
cupboard, what's expiring, what needs reordering. Built it because my family kept buying duplicate
strips and then running out of something else. Free, no ads, no in-app purchases.

I need 14 days of closed testing to unlock production access. Happy to reciprocate — I've already
tested [App A], [App B] and [App C] from this community this week, and I'll join yours the same day.

What I need from you:
1. An Android phone with the Play Store signed in.
2. Opt in via the link and install FROM THE PLAY STORE (sideloaded APKs don't register with Google).
3. Stay opted in and keep it installed for the full 14 days.
4. Open it a few times and add a couple of items. I'll ping every 2–3 days with one small thing to try.

Genuine feedback very welcome, and I will actually ship fixes during the window.

DM me your Gmail and I'll add you today. 🙏
```

> 🚨 **Say "DM me" — never "drop your email below".** Public collection publishes testers' personal addresses for scraping and is the fastest way to attract throwaway accounts. Tester authenticity is exactly what the production review grades.

### Instructions to send once they're on the list

```
1. On your Android phone, check which Google account the Play Store is signed into.
   It MUST be the exact address you gave me.
2. If you were ever an internal tester for this app, open the internal link first and OPT OUT.
   (Google blocks internal testers from closed tests — you'd silently get nothing.)
3. Open this link in a browser on that phone: [paste the link from the Testers tab]
4. Tap the opt-in / become-a-tester link.
5. On the confirmation page, tap "Download it on Google Play."
6. Tap Install. If it says "not available in your country" or 404s, tell me immediately —
   don't retry silently, it's usually something I have to fix.
7. Open the app, sign up, add a couple of items. For a day or two it may show a placeholder
   name — that's Google's listing sync, it clears itself.
8. Please keep it installed and stay opted in until I confirm we're approved (about 3 weeks).
```

> **Distribute in one coordinated wave.** Staggered opt-ins mean staggered streaks, and your application date is set by your 12th-slowest tester. Wait a few hours after publish (the link takes time to propagate) and test it yourself in incognito first.

---

<a name="08-lookback"></a>
## 8. Action 6 — the 14-day lookback

> **The rule:** *a minimum of 12 testers who have been opted in for at least the last 14 days continuously*, evaluated **at the moment you click Apply**.

**It is a lookback, not a countdown.** There's no banked "completed" state. When you apply, Google looks back 14 days and checks ≥12 people have an unbroken streak covering that window. At 11 the day before you apply, you're not eligible — regardless of how long the test has run.

**Continuity is per-tester.** Google: *even if they opt back in so that they are opted in for a total of 14 days, these 14 days must be consecutive.* A dropout loses *their own* days permanently.

> ⚠️ **An honest note.** Nearly every vendor blog says dropping below 12 resets the whole campaign. **I found no Google source for that** — the published wording is per-tester. Your behaviour is the same either way (over-recruit), but the frightening version is unsourced. `[CLAIM]`

### What Google never tells you
- **When the clock starts.** No documented start event. Only the end condition is defined. Every blog claiming otherwise invented it.
- **Whether testers must open the app.** The numeric gate says only "opted in." But *"your testers not being engaged with your app during your closed test"* is verbatim Google policy as a reason to be sent back. No source states any frequency or duration — **every specific number circulating is invented.**
- **Whether uninstalling breaks continuity.** Google addresses opting out but never uninstall. Support told one developer it resets the period. Asymmetric downside — tell testers not to.

### Run the window deliberately
1. **Don't start counting day 1 until you have 15+ confirmed installs.** Write the date down. This buffer absorbs three dropouts.
2. **Message every 2–3 days with one specific micro-task.** *"This week: add a medicine with an expiry date and tell me if the reminder text reads right."* Never daily spam.
3. **Keep a dated feedback log from day 1** — tester, date, channel, what they said, what you did. Raw material for five of the eight application answers; **cannot be reconstructed afterwards**.
4. **Read Ratings and reviews → Testing feedback** in the console, not just your inbox.
5. **Ship 1–3 small updates** driven by real feedback. *Research split here* — one strand advised freezing the build. I lean toward shipping because the rejection email cites failure to act on feedback via updates. If risk-averse, ship exactly one mid-window update.
6. **Around day 10, audit the roster.** A replacement recruited on day 10 starts their *own* 14 days.
7. **Apply on day 15 or 16**, never 13 or 14. The console shows no per-tester counter, so you can't audit the boundary.

### Things that will silently cost you the window

| Trap | What happens |
|---|---|
| **Sideloading** | Google has zero signal the person exists. #1 cause of "dashboard looked fine, then rejected" |
| Being on the list ≠ opted in | 14 emails = 14 non-testers until each opens the link, accepts and installs |
| Pausing the track | Closest documented thing to actively breaking your own test |
| Re-pointing the track to a new list | That's a *reviewed* change. Changing list *membership* is not. Keep one list |
| Creating a second closed track | Splits your tester count. Fix problems inside Alpha |
| **Version-code inversion** | Users get the highest version code from any eligible track. `eas.json` auto-increments remotely `[REPO]`, so a stray production build outranking Alpha silently swaps your testers' build. **Real risk here** |
| Deleting `reviewer@carekosh.com` | Housekeeping queries will remove it unless protected — dead demo credentials are a named rejection cause |
| Dropouts during the *application* review | Approval takes ~7 days. Tell testers to stay in until you confirm |

---

<a name="09-production-access"></a>
## 9. Action 7 — the production-access application

> 🚨 **Draft all eight answers in a separate document before opening the form.** Google warns — once per section — that Discard or quitting without pressing Next/Apply loses everything. `[CLAIM]`

Three sections, eight inputs. **Section 1 is the one actually assessed**; Google states Section 2's answers do not affect access or eligibility.

### Section 1 — About your closed test (**scored**)
**Q1 · How easy was recruiting?** Multiple choice, telemetry only. Answer honestly.

**Q2 · Tester engagement.** Google's examples: whether testers used *all* your features, and whether usage matched a production user.

```
All [N] testers installed from the Play Store and remained opted in for the full 14 days.
Coverage: all [N] created an account and added inventory items; [N] set expiry dates and saw
expiry warnings; [N] used the low-stock threshold and reorder flow; [N] generated an order and
exported the PDF; [N] exercised account deletion on a throwaway account.

Where tester usage differed from real usage: testers seeded inventory in one sitting, whereas a
real household accumulates items over weeks — so expiry and low-stock paths were exercised with
artificially clustered dates. I additionally seeded staggered dates on two devices to test them
realistically.
```

**Q3 · Feedback received, and how you collected it.**
```
Feedback came through three channels: the feedback email published on the tester opt-in page, a
WhatsApp group for testers from my personal network, and the Play Console "Testing feedback" panel.

Themes: [e.g. the low-stock threshold wasn't discoverable during onboarding; the item form asked
for too many fields before letting you save; the expiry reminder wording was ambiguous about
"expired" vs "expiring soon"].
```

### Section 2 — About your app (**not scored**)
**Intended audience** — be as specific as possible:
```
Indian households managing recurring medicines and medical consumables — typically one adult
keeping track of supplies for elderly parents or someone with a chronic condition. Most currently
track this on paper or not at all, which leads to buying duplicates of one item while running out
of another.
```
Plus a value paragraph and a wide-range install estimate.

### Section 3 — Production readiness
**Q1 · What you changed based on the closed test.**
```
[Tester reported X on day 4 → fixed and shipped in the day-6 closed release.]
[Tester reported Y on day 8 → fixed and shipped in the day-11 closed release.]
```
**Q2 · How you decided it was ready.** Concrete inputs: crash-free rate from Android vitals, the auto-generated pre-launch report, backend uptime across the window, no open P1 bugs.

> 🚨 **The one way to fail this on your own.** Section 1 Q3 and Section 3 Q1 are read *against each other*. Claiming substantive feedback then claiming you changed nothing reads as a fabricated test. If genuinely nothing broke, **never write "no issues found"** — describe usability refinements.

> **If rejected:** the email is titled *"More testing required to access Google Play production"* and instructs another 14 days before reapplying. No meaningful appeal; Support won't give app-specific reasons. Watch the **account owner's** inbox. `[CLAIM]`

---

<a name="10-production-release"></a>
## 10. Action 8 — the first production release

> 🚨 **There is no staged rollout on a first production release.** All-or-nothing: 100% of users in every selected country at once. The percentage dial appears from your *second* release onward. `[CLAIM]`
>
> *The previous edition instructed "10–20% → 50% → 100%" in four places and made "pause the staged rollout" step one of mobile incident response. That control will not exist on launch day. Combined with `updates.enabled=false` (no OTA fix), you would have gone to 100% believing you had two safety nets you do not have.*

1. **Set countries BEFORE creating the release.** Production → Countries/regions. Consider **India-only first**, expanding after a week of clean vitals — the closest thing to a staged rollout available to you.
2. **Promote the exact build your testers validated** rather than uploading a fresh AAB.
3. **Confirm pricing is Free** and the listing is final.
4. **Create the release, write notes, send for review.** Up to another 7 days, and it can still come back rejected — production *access* and app *approval* are separate gates.

---

<a name="11-first-48"></a>
## 11. Action 9 — the first 48 hours

Stand the monitors up **before** launch day. They're currently template-only.

- **Android vitals** — crash rate and ANR rate. This is what Google uses against you.
- **Health endpoints** — the curl pair in [Appendix A](#appendix-a).
- **Render, Neon and email provider dashboards** — and confirm a Sentry event actually arrives. If nothing shows, `SENTRY_DSN` is unset and error tracking is silently off. `[DASH]`
- **Connection budget** — 2 workers × (pool 5 + overflow 10) = up to **30 Postgres connections** `[REPO]`. Check against your Neon plan cap *before* traffic arrives.
- **Play Console reviews** — respond to the first ones; early reviews weigh heavily.

> ⚠️ **Point uptime monitors at `/live`, not `/health`.** `/live` never touches the DB and always returns 200. `/health` runs a real query under a 2-second timeout and returns **503 by design** when Neon has idled. `[REPO]` A single `/health` 503 that recovers is **not** an outage — alert only after two consecutive failures. Render's own health check is deliberately `/live`.

**Evidence hygiene:** record outcomes, never tokens, passwords, database URLs or user emails.

---

<a name="12-when-wrong"></a>
## 12. If something goes wrong

> 🚨 **Start from the constraint.** `updates.enabled = false` `[REPO]` — there is **no over-the-air update channel**. Nothing in the mobile app can be hotfixed: not a string, not a URL, not a crash. Every mobile fix is a full build → upload → review cycle. And on release 1 there is no rollout dial to pause.
>
> **Therefore the backend is your only fast lever.** Design fixes to land server-side wherever possible.

### Mobile — a bad release is live
1. **There is no true rollback on Play.** You cannot un-ship a version.
2. **Halt or unpublish** to stop new installs. Existing installs keep the bad build.
3. **Forward-fix only** — higher version code, submit, wait for review.
4. **Keep the backend backward-compatible with the installed bad client.** The single most useful habit — it turns most mobile bugs into server-side fixes.

### Backend — roll back
- Render → **Events → Rollback**. Note this **disables auto-deploy** — re-enable it afterwards.
- **A Render rollback does not roll back Neon data.** Plan migrations to be backward-compatible.
- A failed Alembic migration exits non-zero and Render keeps the previous instance live `[REPO]` — a bad migration is a *failed deploy*, not a broken service. Good failure mode; don't "fix" it.

### Do NOT roll back for
- A single `/health` 503 that recovers (Neon waking).
- One unreproducible user report.
- Cosmetic issues, or anything fixable by an env-var change.

---

<a name="13-release-2"></a>
## 13. Release 2 and beyond

1. `eas build --profile production --platform android`
2. `eas submit --profile production --platform android` → lands on the **internal** track, always. `[REPO]` The profile is *named* production but its track is `internal`.
3. Smoke-test on internal, then **promote** internal → closed → production in the Console.
4. **Now the staged rollout dial exists.** Start at 10–20%, watch vitals a day or two, then 50%, then 100%. Halt and resume are available.
5. Version codes auto-increment remotely — never hand-edit `app.json`.

> **Two things to keep safe forever:** Play App Signing means Google holds the app signing key, but **you** hold the upload key via EAS — back up your EAS credentials. And set your Expo token to no expiry or schedule yearly rotation, or CI fails months from now for no obvious reason.

---

<a name="14-settled"></a>
## 14. Already settled — the compact record

What used to be ~450 lines of instructions, now facts. Nothing here needs doing.

| Area | Settled state |
|---|---|
| **Identity** | Package `com.carekosh.mobile` — **permanently locked**, first AAB uploaded. CareKosh, v1.0.0 `[REPO]`. *(Slug and URL scheme still read `vitaltrack` — cosmetic.)* |
| **Accounts** | Expo/EAS with `EXPO_TOKEN` in GitHub; Play account paid and ID-verified |
| **Legal hosting** | Cloudflare Pages. `/privacy-policy` and `/account-deletion` live, HTTPS, no login `[LIVE]`. *`/terms` and `/support` return 404 — don't reference them* |
| **Store listing** | Uploaded. Icon 512×512 and feature graphic 1024×500 generated locally with Pillow from the real app icon |
| **Backend** | Render **Starter** (always-on), Singapore, Docker, Python 3.12, gunicorn + 2 Uvicorn workers. Alembic on boot `[REPO]` |
| **Build config** | Production profile builds an app bundle with `EXPO_PUBLIC_API_URL=https://api.carekosh.com` **baked in**. Version code lives on EAS `[REPO]` |
| **Permissions** | **Three**, all "normal" — no runtime prompts, no sensitive-permission form: `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` `[REPO]`. *Correction: earlier docs said only `ACCESS_NETWORK_STATE`; `ACCESS_WIFI_STATE` arrives via netinfo* |
| **Reviewer account** | `reviewer@carekosh.com`, force-verified in Neon. See [Appendix E](#appendix-e) |
| **First upload** | Done manually — Google's API blocks the first-ever upload. `eas submit` works from here |
| **Internal smoke** | Passed on a real device |

---

<a name="15-no-ai"></a>
## 15. This release ships no AI

The decision is recorded in [`first_agentic_integration.html`](first_agentic_integration.html): **launch first with AI disabled; the AI build ships in the next cycle.** Do not bundle a novel AI surface into the submission already carrying your production-access application.

**Consequences, all simplifying:** no AI claims in the listing · no content-rating change · no new Data Safety category · no AI-content reporting requirement · nothing in the AI plan blocks this launch.

> **One retraction worth knowing.** The AI implementation plan gated work on adding an `updated_at` bump, believing the current update path didn't refresh it. Tested against the real update shape — **it does bump correctly**. Prerequisite withdrawn; don't spend launch-window days on it.

> **When the AI build does come**, it carries a delta this guide doesn't cover: a mandatory in-app reporting control for AI-generated content, a Data Safety update for chat messages, and a new AAB. All in the decision record. **Not now.**

---

<a name="appendices"></a>
# Appendices

<a name="appendix-a"></a>
## Appendix A — Command cheat sheet

```bash
# ---- sync + tooling ----
git checkout main && git pull --ff-only
npm install -g eas-cli          # must be under the Node in .nvmrc (22)
eas whoami

# ---- verify the backend BEFORE building (the URL is baked into the AAB) ----
curl -s https://api.carekosh.com/live    # expect 200 always
curl -s https://api.carekosh.com/health  # 200; a first-hit 503 after idle is BY DESIGN

# ---- clean install (use this, not ad-hoc npm install) ----
cd vitaltrack-mobile
npm ci                          # .npmrc already sets legacy-peer-deps=true
# if the lockfile is genuinely broken:
#   rm -rf node_modules package-lock.json && npm install && git add package-lock.json

# ---- if Metro reports files that clearly exist (stale watchman crawl) ----
watchman watch-del-all && watchman shutdown-server

# ---- build + submit ----
eas build --profile production --platform android
eas build:list --limit 5
eas build:version:get --platform android    # version code lives on EAS, not app.json
eas submit --profile production --platform android   # → INTERNAL track, always

# ---- inspect what the AAB actually declares ----
bundletool dump manifest --bundle app.aab | grep uses-permission
# expect exactly three: INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE
# (or read Play Console → App bundle explorer → Permissions)

# ---- confirm the service-account key can never be committed ----
git check-ignore -v vitaltrack-mobile/credentials/google-service-account.json

# ---- backend verification scripts ----
cd vitaltrack-backend
python scripts/smoke_api.py
python scripts/check_api_routes.py --expected 39
python scripts/cold_start_load_smoke.py
python scripts/restore_drill.py

# ---- reviewer account (already done; kept for re-creation) ----
curl -X POST https://api.carekosh.com/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"reviewer@carekosh.com","password":"...","name":"Play Reviewer"}'
# then in Neon SQL editor:
#   UPDATE users SET is_email_verified = true WHERE email = 'reviewer@carekosh.com';
curl -X POST https://api.carekosh.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"reviewer@carekosh.com","password":"..."}'   # expect 200 + access_token

# ---- users-table housekeeping: ALWAYS SELECT BEFORE DELETE ----
#   SELECT email FROM users WHERE email IS NULL
#     OR email NOT IN ('reviewer@carekosh.com','your-real-email@gmail.com');
#   -- then the matching DELETE (every user-owned table is ON DELETE CASCADE)
```

<a name="appendix-b"></a>
## Appendix B — Ground-truth facts about this codebase

| Fact | Where |
|---|---|
| Package `com.carekosh.mobile`, name CareKosh, version 1.0.0 | `app.json` |
| **Version code lives on EAS servers** — `appVersionSource: remote` + `autoIncrement: true`. `app.json`'s `versionCode: 1` is **inert**; never hand-edit | `eas.json` |
| `eas submit --profile production` targets `track: internal` — can never reach production | `eas.json` |
| Production API URL **baked into the AAB** at build time | `eas.json` |
| Three shipped permissions, all "normal": INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE | merged manifest |
| Blocked: CAMERA, RECORD_AUDIO, SYSTEM_ALERT_WINDOW, VIBRATE, READ/WRITE_EXTERNAL_STORAGE | `app.json` |
| Only image path is the system photo picker — no camera call, no runtime permission request | `app/item/[id].tsx` |
| `allowBackup: false` — Android Auto Backup fully disabled | `app.json` |
| Cleartext disabled in production via `expo-build-properties` | `app.config.js` |
| Expo SDK ~54.0.35, React Native 0.81.5, Node 22 pinned | `package.json`, `.nvmrc` |
| **Target API 36 is inherited from SDK 54**, not pinned — re-verify in App bundle explorer before each release | — |
| **`updates.enabled = false` — no over-the-air update channel** | `app.json` |
| **`npm test` is dead** — jest isn't installed and no test files exist. Only `npm run lint` works | `package.json` |
| Render: Starter plan, Singapore, health check `/live` | `render.yaml` |
| Login is `POST /api/v1/auth/login` with `{identifier, password}` | `auth.py` |
| **Account deletion is `DELETE /api/v1/auth/me`** — note the `/api/v1` prefix (an older doc omitted it) | `auth.py` |
| Rate limits: register 3/hour, login 5/min, resend-verify 3/hour, forgot-password 3/hour | `auth.py` |
| Email verification enforced only if `REQUIRE_EMAIL_VERIFICATION=true` **and** `MAIL_PASSWORD` is non-empty | `utils/email.py` |
| Connection budget: 2 workers × (pool 5 + overflow 10) = up to 30 Postgres connections | `config.py` |
| CI gates: ruff, pytest, route count = 39, 70% per-file coverage on two files. **mypy and the security scan are advisory** — green CI ≠ clean dependency scan | `ci.yml` |

<a name="appendix-c"></a>
## Appendix C — Data Safety inventory

| Data | Collected | Shared | Purpose |
|---|---|---|---|
| Email address | Yes | No | Account management, verification, password reset |
| Name | Yes | No | Account personalisation |
| Phone (optional) | Yes | No | Account contact |
| Password | Yes | No | Authentication — Argon2-hashed, never plaintext |
| Inventory items, categories, orders | Yes | No | Core app functionality |
| **Photos** | **No** | No | **Processed on-device only.** `item.image_uri` stores a local device URI; the binary never leaves the device `[REPO]` |
| Crash / diagnostics | If Sentry enabled | Yes — Sentry | Error monitoring `[DASH]` |

> ⚠️ **Two corrections to the previous edition.** Its table declared Photos as *collected*, contradicting its own verified answer elsewhere — Photos are **not** collected. And its processor list omitted **Sentry**; name it, or confirm the DSN is unset.

Processors: Render (hosting), Neon (database), your email provider, Google Play, and Sentry if enabled.
Encryption in transit: yes. Deletion: `https://carekosh.com/account-deletion`. "Delete some data without deleting the account?" → **No**.

<a name="appendix-d"></a>
## Appendix D — Reviewer "App access" text

```
All CareKosh functionality requires a signed-in account. Use the demo account below.

Username / email: reviewer@carekosh.com
Password:         [current password]

Sign in on the app's login screen. This is a CareKosh application account, not a Google account —
nothing is emailed to you and no verification step is required.

Flows available with this account:
 • Dashboard — inventory summary and items needing attention
 • Inventory — browse, search, add, edit and delete items
 • Item detail — quantity, minimum stock, expiry date, brand, supplier; attach a photo from the gallery
 • Orders — build an order from low-stock items, export as PDF, mark received and apply stock
 • Profile — account settings and full account deletion

No two-factor authentication, no biometrics, no region restrictions.
```

- Tick **"Sign-in details provide full access"**. Leave "Any other information required" blank.
- **Test the credentials the day you submit.** Dead demo credentials are a named rejection cause.
- **Mind the rate limit:** login is 5/minute — a reviewer fumbling the password can lock themselves out briefly.
- Rotate the password after review.

<a name="appendix-e"></a>
## Appendix E — Field-tested gotchas from the actual run

*(The previous edition had two sections both numbered "Appendix 6"; merged here.)*

### E1 · Build & dependency

| Symptom | Cause and fix |
|---|---|
| `eas build` fails at Bundle JavaScript: `Cannot find module 'babel-preset-expo'` | Mixing `npm install --legacy-peer-deps` with a plain `npm install` desynced the lockfile. Clean reinstall, then **commit the regenerated lockfile** |
| Metro reports files that plainly exist on disk | Stale watchman crawl — not Node, not corruption. `watchman watch-del-all && watchman shutdown-server` |
| `eas: command not found` after switching Node | eas-cli was global under a different Node. Reinstall, or use `npx eas-cli` |
| `expo-doctor` flags `android.usesCleartextTraffic` | Never a real Expo key. Cleartext control lives in the `expo-build-properties` plugin |

### E2 · Cloudflare Pages
- The dashboard shows "Create a Worker", not a Pages wizard — click **"Upload your static files"**.
- The **"Worker name"** field *is* the project name.
- Custom domain: the subdomain field auto-appends your domain. **Leave it empty** for the root — typing the full domain produces `carekosh.com.carekosh.com`.
- `.html` URLs 307-redirect. Give Google the **extensionless** paths.

### E3 · Play Console navigation
- **"App content" is not a menu item** — it's in your app's Dashboard checklist.
- "Developer account → Developer profile" is account-level branding, separate and optional.
- Tablet screenshots look mandatory but aren't enforced for a phone-only app.
- The feature graphic is no longer shown on your own listing page since a Store redesign.

### E4 · Verified form answers

| Question | Answer | Why |
|---|---|---|
| Collects Photos? | **No** | Local URI only; the binary never leaves the device |
| Account creation | Username and password | No OAuth in the app |
| Delete some data without deleting account? | **No** | Only full deletion is documented |
| Content-rating category | All other app types | Matches a utility/inventory app |
| Store category | House & Home | Keeps the app out of the stricter health/Organization bucket |

### E5 · Testing timing
- **Internal testing:** instant, no review. You must still add yourself explicitly.
- **Closed testing is different:** the first-ever closed release goes through a manual review of up to 7 days *before* anyone can install — before, not during, the 14-day window.
- The temporary `(unreviewed)` name and the "no deobfuscation file" warning are both cosmetic.

<a name="appendix-f"></a>
## Appendix F — Policies that apply, and when to re-check

| Policy | Status for CareKosh | Re-check |
|---|---|---|
| Target API floor | API 36, inherited from SDK 54 — satisfies the current floor | **Before every release** — the floor steps up annually |
| 12 testers / 14 days | Applies — personal account | Before applying |
| Financial features declaration | Required; answer "no financial features" | Once |
| Health apps declaration | Required of all published apps | Once, and if listing wording changes |
| Account deletion | Required — in-app flow plus web URL, both exist | Verify the email actually sends |
| Data safety accuracy | Must match observable behaviour | Every release that changes data handling |
| Developer verification / app registration | Deadline reported as 30 Sept 2026 | Confirm in Console — the package was renamed recently `[CLAIM]` |

<a name="appendix-g"></a>
## Appendix G — Known gaps and open code tasks

None block launch. Recorded so they aren't rediscovered under pressure.

- **No in-app link to the privacy policy or deletion page.** The About dialog has only a support email. The in-app Delete Account flow itself exists. The kind of thing a reviewer looks for.
- **`carekosh.com/terms` and `/support` return 404** `[LIVE]` — don't reference them in the listing's support-website field.
- **Mobile has no test infrastructure** — `npm test` is dead.
- **No automated backups**; the restore drill script exists but evidence files are weeks old. Re-run before launch.
- **Uptime monitors are template-only** and the alert destination is a placeholder.
- `CAREKOSH_ALLOW_ANDROID_CLEARTEXT` has no profile guard — it would re-enable cleartext even on production if ever set.
- CI runs Python 3.11 while Docker ships 3.12 — tests never execute on the shipping runtime.
- The Docker entrypoint can't parse a portless database URL, so every boot burns a 60-second wait before migrations. Harmless, but deploys look hung.
- `expo-keep-awake` is imported but not declared in `package.json`.
- Slug and URL scheme still say `vitaltrack`. Cosmetic.
- Generated Play assets (icon, feature graphic) aren't committed anywhere.

---

*CareKosh → Google Play Launch Playbook · rewritten July 2026 · reorganised around current state.*
*Repo facts verified in-session; external claims graded. Companion: [`first_agentic_integration.html`](first_agentic_integration.html) (AI, deferred).*
*Re-verify anything marked `[CLAIM]` before acting on it — Google changes these without notice.*
