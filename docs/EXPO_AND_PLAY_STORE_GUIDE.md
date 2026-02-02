# Expo & Play Store Setup Guide

> **Goal:** Complete guide to configuring Expo, linking GitHub, and publishing to the Google Play Store.

---

## 🟢 Part 1: Expo Account Setup (Required for All Builds)

### Step 1: Create Expo Account (2 minutes)
1. Go to: [https://expo.dev/signup](https://expo.dev/signup)
2. **Recommendation:** Sign up with **GitHub** (uses your existing GitHub account).
3. Authorize Expo to access your GitHub.
4. Complete profile setup.

### Step 2: Install & Login (Terminal)
Open your terminal and run:
```bash
npm install -g eas-cli
eas login
# Verify login:
eas whoami  # Should show your username
```

### Step 3: Configure Project (Terminal)
This connects your local code to your Expo account.
```bash
cd vitaltrack-mobile
eas build:configure
```
*   **Action:** Select "All" or "Android" if asked.
*   **Result:** This automatically updates `app.json` with your new Project ID.

### Step 4: Create Access Token for CI/CD (GitHub Actions)
1.  Go to: [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens)
2.  Click **Create Token**.
3.  Name: `GitHub Actions`
4.  Expiration: **No expiration** (Recommended for CI to avoid breakage).
5.  Click **Create**.
6.  **STOP & COPY IT:** You will see a popup with the token.
    *   *Note: Whether it starts with `expo_` or is a random string, COPY IT. You won't see it again.*

### Step 5: Save to GitHub
1.  Go to your GitHub Repo: [github.com/rishabhrd09/vitaltrack](https://github.com/rishabhrd09/vitaltrack)
2.  **Settings** → **Secrets and variables** → **Actions**.
3.  Click **New repository secret**.
4.  **Name:** `EXPO_TOKEN` (⚠️ Must be exactly this).
5.  **Value:** (Paste the token you copied).

---

## 📱 Part 2: The "Test" Workflow (Local -> Production)

Once setup is done, verify the connection:

**Command:** `npx expo start --clear`

| Component | Status |
|-----------|--------|
| **Local Code** | Running on your laptop terminal. |
| **Expo Go (Phone)** | Connected to laptop via Wi-Fi (scan QR code). |
| **Backend** | The app talks to the **Live Railway Backend** (defined in `.env`). |

**Success Criteria:**
1.  App loads on phone.
2.  You can Register/Login (confirms Database connection).

---

## 🟡 Part 3: Google Play Console (Required for Store Release)

### Step 1: Create Developer Account ($25 One-Time)
1.  Go to: [play.google.com/console/signup](https://play.google.com/console/signup)
2.  Sign in with Google account.
3.  Pay **$25** registration fee.
4.  Complete **Identity Verification** (ID or Business Docs).
    *   *Wait Time: 24-48 hours.*

### Step 2: Create Your App
1.  Click **Create app**.
2.  **App Name:** `VitalTrack - Medical Inventory`
3.  **App Category:** App / Medical / Free.
4.  Accept all declarations.

### Step 3: Complete Store Listing
You must fill out these sections before you can release:
*   **App Access:** Provide a test user/pass if login is required.
*   **Content Rating:** Complete the questionnaire (e.g., "Medical App", "18+").
*   **Data Safety:** Declare what data you collect (Name, Email, Device ID).
*   **Assets:**
    *   **Icon:** 512x512 PNG.
    *   **Feature Graphic:** 1024x500 PNG.
    *   **Screenshots:** Minimum 2 phone screenshots.

### Step 4: Create Service Account (Automating Submissions)
This allows `eas submit` to upload your app automatically.

1.  Go to **Play Console** → **Users & Permissions** → **API Access**.
2.  Click **Create new service account** (Follow link to Google Cloud).
3.  **Google Cloud:** Create Service Account -> Name: `eas-submit` -> Role: **Service Account User**.
4.  **Create Key:** Manage Keys -> Add Key -> JSON -> **Download it**.
5.  **Back in Play Console:** Click "Done". Find the new email, click "Manage Play Console permissions", grant **Admin** (or specifically "Release to testing tracks").
6.  **Save Key:** Save the downloaded file as `vitaltrack-mobile/credentials/google-service-account.json`. (Ensure this folder is in `.gitignore`!).

---

## ⚡ Part 4: Potential Challenges (Watch Out!)

| Challenge | Impact | solution |
|-----------|--------|----------|
| **Verification Delay** | Play Store account approval can take 2-3 days. | Start this process *early*, don't wait until launch day. |
| **Asset Strictness** | Google rejects images if off by 1 pixel. | Use a design tool (Figma/Canva) to get exact 1024x500 and 512x512 sizes. |
| **Privacy Policy** | Required for all apps. | You need a URL. You can host a simple MD file on GitHub Pages or use a free policy generator. |
| **Token Expiration** | CI/CD fails suddenly in the future. | Set Expo Token to "No Expiration" or set a calendar reminder to rotate it. |
| **App Signing** | Confusing manual key management. | **Let EAS handle it.** Choose "Let Google manage app signing" and let EAS generate the keys. |

---

## 🚀 Final Summary Checklist

- [ ] **Expo Account** created & linked locally (`eas build:configure`).
- [ ] **GitHub Secret** (`EXPO_TOKEN`) added.
- [ ] **Frontend URL** set variable on Railway (for emails).
- [ ] **Play Store Account** paid & verified (can be done later).

**You are ready to build!**
To build a preview APK right now:
```bash
npx eas build --profile preview --platform android
```
