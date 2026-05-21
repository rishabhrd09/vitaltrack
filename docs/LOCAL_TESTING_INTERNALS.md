# Local Testing — Internals & Step-by-Step

> **The conceptual companion** to [LOCAL_TESTING_COMPLETE_GUIDE.md](LOCAL_TESTING_COMPLETE_GUIDE.md) and [USB_ADB_REVERSE_GUIDE.md](USB_ADB_REVERSE_GUIDE.md).
>
> Those two docs tell you **what to type**. This one tells you **what's actually happening** — the architecture, the abstractions, the network layer, and why each command does what it does. Read this once and the operational guides will make a lot more sense.

---

## Table of Contents

1. [What this document is for](#1-what-this-document-is-for)
2. [The fundamental problem we're solving](#2-the-fundamental-problem-were-solving)
3. [The four actors](#3-the-four-actors)
4. [The three connection modes](#4-the-three-connection-modes)
5. [End-to-end flow — from cable plug-in to dashboard](#5-end-to-end-flow--from-cable-plug-in-to-dashboard)
6. [Step-by-step setup, with the "why" behind each command](#6-step-by-step-setup-with-the-why-behind-each-command)
7. [Three things that confuse everyone](#7-three-things-that-confuse-everyone)
8. [Glossary](#8-glossary)

---

## 1. What this document is for

Most React Native developers learn the dev loop as a sequence of incantations: "plug in phone, run `adb reverse`, run `npm run start:staging`, scan QR code, app appears." It works most of the time, and when it breaks people don't know where to start because the abstractions are opaque.

This doc opens the abstractions. By the end you will understand:

- **Why** React Native needs both a "native shell" and a separate JavaScript bundle
- **What** Expo Go actually is and why it can run any Expo-compatible app
- **What** Metro is and what it serves
- **What** ADB does and why we use *only* its port-forwarding feature
- **How** the phone actually reaches the laptop (three possible paths — pick one)
- **Why** `localhost` means different things in different places, and why this matters
- **Step by step** what happens from the moment you plug in the phone to the moment the dashboard renders

Knowing the model means you can debug *anything* in this stack — when "Connecting…" hangs, you'll know which of the four hops it could be stuck on.

---

## 2. The fundamental problem we're solving

CareKosh is a React Native app. React Native is *neither* a webpage *nor* a regular Android APK. It's a hybrid:

- **The UI is real native Android.** Buttons are `android.widget.Button`. Text inputs are `android.widget.EditText`. Scroll views are `android.widget.ScrollView`. There is no WebView, no embedded browser. When you tap a button, you tap a real native widget that responds at native speed.
- **The logic is JavaScript.** Your component tree, state management, business rules, API calls — all written in TypeScript / JSX, all run inside a JavaScript engine that's bundled into the app process.

These two halves communicate through a *bridge* (or in newer React Native versions, JSI — a more direct binding). When JS says "render `<Text>Hello</Text>`," the bridge translates that into a real `TextView` instance.

A complete React Native app therefore has **two parts that need to coexist on the phone**:

1. **The native shell** (`.apk`) — provides UI primitives, navigation, camera, file access, network stack, etc.
2. **The JavaScript bundle** (`.bundle`, ~10MB for our app) — your code.

### How production ships this

For the Play Store, both halves are baked into one APK. EAS Build does this for us:

```
eas build --profile production
  ↓
Compiles your JS → bundle, packages with native shell → AAB → Play Console
```

A full build takes 10-30 minutes. The user downloads the AAB; it just works.

### Why we don't do that for development

Imagine making a one-line change to a TypeScript file and waiting 15 minutes for a fresh APK. Multiply by hundreds of edits per day. Unbearable.

So for dev, we use a clever trick: **a fixed, pre-built native shell that can fetch any compatible JavaScript bundle from a server.**

That fixed shell is **Expo Go**. The server is **Metro**. Your JS bundle is the only thing that changes. Iteration becomes:

```
Edit .tsx file → save → Metro re-bundles in 1-2s → Expo Go reloads → see change.
```

Round trip in seconds, not minutes. That's why this whole setup exists.

---

## 3. The four actors

### 3.1 Metro bundler — the JavaScript packager

Metro is a JavaScript bundler purpose-built for React Native. Same family as Webpack or Vite, but tailored: it knows about `.tsx` / `.jsx`, knows about React Native's resolver rules, knows how to serve hot-reload patches.

When you run `npm run start:staging`:

```
PowerShell
  ↓ runs npm script
package.json says: "cross-env EXPO_PUBLIC_API_URL=https://... expo start --clear"
  ↓
Metro process boots:
  1. Reads vitaltrack-mobile/app, components, hooks, utils, etc.
  2. Resolves every import (your code + node_modules)
  3. Transpiles TypeScript → JavaScript
  4. Bundles everything into one big .bundle file (~10 MB)
  5. Starts an HTTP server on port 8081
  6. Watches the filesystem; on change, re-bundles incrementally
  7. Prints a QR code to the terminal
```

Metro **does not run your app**. It just packages it. When asked (via HTTP), it serves the bundle. When a file changes, it recomputes which parts of the bundle need to change and pushes a patch to whoever's listening (Expo Go, in our case).

Critically: Metro is a **purely local development tool**. It never ships to production. The Render-hosted backend has nothing to do with it.

### 3.2 Expo Go — the generic native shell

Expo Go is a regular Android app you installed from the Play Store. It's a real APK. Inside it:

- **The native shell that React Native needs** — the bridge, the React Native runtime, all the native modules in the Expo SDK
- **A JavaScript engine** — Hermes (a lightweight VM Facebook built specifically for React Native; smaller and faster startup than V8)
- **A loader** — knows how to fetch a JS bundle from a Metro URL and execute it inside Hermes

When you point Expo Go at a Metro URL like `exp://localhost:8081`:

```
1. Expo Go parses the URL
2. Expo Go HTTP-fetches http://localhost:8081/index.bundle?platform=android
3. Server returns ~10 MB of JavaScript
4. Expo Go loads the bundle into Hermes
5. The bundle calls AppRegistry.registerComponent('main', App)
6. Expo Go's native shell renders App as native Android views
7. Your app is now running
```

Expo Go is a **generic shell**. It can load *any* Expo-compatible JS bundle — CareKosh, a different app, a demo from a tutorial. They all work because the native APIs they rely on (file system, image picker, camera, etc.) are all provided by Expo Go's shell.

This generality has a cost: **you cannot add new native dependencies that aren't in Expo Go's shell**. If a library requires its own native code (like `burnt`, which uses SwiftUI on iOS and Material You on Android), Expo Go won't have it loaded — the app will crash on import.

That's why CareKosh sticks to pure-JS dependencies (e.g. `react-native-toast-message` instead of `burnt`). It keeps us in Expo Go's land.

(For native deps you absolutely need, you build a "development build" — a custom Expo Go-like shell with your specific native modules baked in. We haven't needed to.)

### 3.3 ADB — Android Debug Bridge

ADB is a tool from the Android SDK. It lets your laptop talk to your Android phone over USB. Three components:

| Component | Where it runs | Role |
|---|---|---|
| **adb client** | On your laptop, the `adb.exe` you type | Sends commands |
| **adb server** | Background process on your laptop, port 5037 | Multiplexes between client and connected devices |
| **adbd** (adb daemon) | On the phone, runs when USB Debugging is enabled | Receives commands, executes them |

When you type `adb devices`:

```
adb.exe                   adb server                     adbd (phone)
┌─────────┐  pipe       ┌───────────────┐   USB        ┌─────────────┐
│ client  │────────────►│ server :5037  │─────────────►│  daemon     │
└─────────┘             └───────────────┘              └─────────────┘
                                ▲                              │
                                │           USB                │
                                └──────────────────────────────┘
                                    "I am ABCD1234, status: device"
```

ADB can do many things — install APKs, read logs, run shell commands, copy files, port-forward. **For our development setup, we use exactly one feature: port forwarding.** Specifically `adb reverse`, which lets traffic on the phone's `localhost` get tunneled back to the laptop.

If your phone status shows `unauthorized`, the daemon on the phone hasn't been told to trust your laptop's RSA key yet. The phone shows an "Allow USB debugging?" dialog containing your laptop's key fingerprint. Tapping "Always allow from this computer" stores the key on the phone, and from then on `adb` works.

### 3.4 The backend (FastAPI on Render)

Your local Docker backend OR the staging backend on Render OR the production backend — it doesn't matter which from the dev loop's perspective. The mobile app makes HTTPS calls to *some* URL, that URL responds with JSON. The URL is determined by the env var `EXPO_PUBLIC_API_URL`.

| Backend choice | URL | When you'd use it |
|---|---|---|
| Local Docker | `http://localhost:8000` (with `adb reverse`) or `http://YOUR_LAN_IP:8000` | Day-to-day dev with code changes on both ends |
| Render staging | `https://vitaltrack-api-staging.onrender.com` | Reproduce a staging-only bug; demo to others |
| Render production | `https://vitaltrack-api.onrender.com` | Manual smoke test of the live system |

The npm scripts wire the right URL:

```json
"start:local":   "cross-env EXPO_PUBLIC_API_URL=http://localhost:8000 expo start --clear"
"start:staging": "cross-env EXPO_PUBLIC_API_URL=https://vitaltrack-api-staging.onrender.com expo start --clear"
"start:prod":    "cross-env EXPO_PUBLIC_API_URL=https://vitaltrack-api.onrender.com expo start --clear"
```

When Metro bundles your code, it reads `process.env.EXPO_PUBLIC_API_URL` and inlines the value into the bundle. The mobile app reads `API_BASE_URL` from [`vitaltrack-mobile/services/api.ts`](../vitaltrack-mobile/services/api.ts):

```ts
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
```

That value is *baked into the bundle at bundle-time* — changing the env var requires a Metro restart (with `--clear`).

---

## 4. The three connection modes

Once Metro is running on your laptop and Expo Go is installed on your phone, the question is: **how does Expo Go reach Metro?** Three answers, pick the one that fits your situation.

```
                     ┌─────────────────────────────────────┐
                     │  How is your phone reaching Metro?  │
                     └─────────────────┬───────────────────┘
                                       │
              ┌────────────────────────┼─────────────────────────┐
              ▼                        ▼                         ▼
       ┌──────────────┐        ┌──────────────┐         ┌──────────────┐
       │  LAN mode    │        │  USB mode    │         │  Tunnel mode │
       │  (Wi-Fi)     │        │  (adb reverse│         │  (public URL)│
       └──────┬───────┘        └──────┬───────┘         └──────┬───────┘
              │                       │                        │
       Phone reaches            Phone reaches             Phone reaches
       laptop via WiFi          laptop via USB cable      laptop via internet
       at LAN IP                using adb tunnel          via expo's tunnel
       (192.168.x.x)            (localhost)               (https://...exp.direct)
```

### 4.1 LAN mode (Wi-Fi)

**Both devices on the same Wi-Fi network.** The phone reaches the laptop using the laptop's LAN IP, e.g. `192.168.1.5:8081`.

Default for `npx expo start`. The QR code in the terminal encodes `exp://192.168.1.5:8081` (your actual LAN IP). Expo Go scans → fetches bundle directly over Wi-Fi.

**When LAN works**: most home networks, most office networks, anywhere the phone and laptop can ping each other.

**When LAN fails**:
- Wi-Fi access point has "client isolation" enabled (devices can't talk to each other) — common on guest networks
- Wi-Fi access point on a different subnet from the laptop (e.g. wired desktop on `192.168.0.x`, phone on guest Wi-Fi `192.168.10.x`)
- Windows firewall blocking inbound on port 8081 (see [LOCAL_TESTING_COMPLETE_GUIDE §E](LOCAL_TESTING_COMPLETE_GUIDE.md#e-windows-firewall))

For LAN mode the env var should be `EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000` (so the API also reaches the laptop's Docker), or staging/prod (which the phone reaches over its own Wi-Fi/LTE).

### 4.2 USB mode (adb reverse)

**Phone is plugged into the laptop with a USB data cable.** ADB runs a TCP tunnel: any time the phone tries to connect to its own `localhost:8081`, the connection is forwarded over USB to the laptop's `localhost:8081`.

```
On the phone:                                   On the laptop:
http://localhost:8081/index.bundle              Metro listening on
              │                                 localhost:8081
              ▼
adbd intercepts (because of `adb reverse`)
              │
              ▼  USB cable
adb server on laptop receives
              │
              ▼
Forwards to laptop's localhost:8081
              │
              ▼
                                                Metro answers ──→ same path back
```

Same trick can forward the API port: `adb reverse tcp:8000 tcp:8000` lets the phone hit `http://localhost:8000` and reach the local Docker backend.

**When USB works**: always, as long as the phone is plugged in and authorized. Doesn't depend on Wi-Fi state, doesn't depend on the network at all (for Metro traffic). The most reliable mode.

**The trade-off**: phone is tethered. Fine at a desk; bad for moving around or demoing.

For USB mode the env var should be `EXPO_PUBLIC_API_URL=http://localhost:8000` (because `localhost` on the phone now means the laptop), or staging/prod (which the phone reaches over its own Wi-Fi/LTE — USB doesn't carry that traffic).

### 4.3 Tunnel mode (public URL)

**Expo creates a public URL via a tunneling service** (currently `ngrok`-like, served at `*.exp.direct`). Your laptop's Metro server is exposed to the internet through this URL.

`npx expo start --tunnel` (note: needs an extra dependency Expo will install on first use). The QR code now encodes a public URL like `exp://abc-xyz.exp.direct:80`. Expo Go connects via the phone's regular internet — could be Wi-Fi, could be LTE.

**When tunnel works**: when LAN fails for network reasons (corporate firewall, client isolation, different subnets) and you don't want to fiddle with USB.

**Trade-offs**:
- Slower (every byte of the JS bundle now travels phone → exp.direct → laptop and back)
- Needs internet on both ends
- Doesn't help your local Docker backend — phone can hit Metro over the tunnel, but `EXPO_PUBLIC_API_URL=http://localhost:8000` won't work because phone's localhost is no longer connected to your laptop. Use `EXPO_PUBLIC_API_URL=https://vitaltrack-api-staging.onrender.com` to keep the API call path simple

---

## 5. End-to-end flow — from cable plug-in to dashboard

Let's trace exactly what happens, USB mode, against staging backend.

### Phase 1 — Setup (once per dev session)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. Plug phone into laptop with USB data cable                          │
│  2. Phone shows "Allow USB debugging?" → tap "Always allow"             │
│  3. `adb devices` → phone shows as `device` (not `unauthorized`)        │
│                                                                         │
│  4. `adb reverse tcp:8081 tcp:8081`                                     │
│         └─→ adb server tells adbd: "any TCP traffic to 8081 on you,     │
│             forward to laptop's 8081"                                   │
│                                                                         │
│  5. `npm run start:staging`                                             │
│         └─→ npm runs the script in package.json                         │
│         └─→ cross-env sets EXPO_PUBLIC_API_URL=https://vitaltrack-...   │
│         └─→ expo CLI starts Metro                                       │
│         └─→ Metro reads source files, builds initial bundle             │
│         └─→ Metro starts HTTP server on port 8081                       │
│         └─→ Terminal prints QR code containing `exp://localhost:8081`   │
│                                                                         │
│  6. Open Expo Go on the phone                                           │
│  7. Scan QR code (or type the URL manually)                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phase 2 — Bundle load (once per "fresh start" of the app)

```
8.  Expo Go parses scanned URL: exp://localhost:8081
9.  Expo Go opens HTTP connection to localhost:8081 on the phone
10. Phone TCP stack: "localhost:8081 — let me check if there's a listener"
11. adbd: "I have a reverse rule for that. Tunnel it."
12. Connection travels phone → adbd → USB cable → laptop's adb server →
    laptop's localhost:8081
13. Metro receives the HTTP request. URL is something like:
    /index.bundle?platform=android&dev=true&hot=true&...
14. Metro builds the bundle (cached after first build, so fast on reload)
15. Metro responds with ~10 MB of JavaScript over the same tunnel
16. Bundle arrives at Expo Go via USB → adbd → app process
17. Expo Go feeds the bundle to Hermes
18. Hermes parses + executes
19. Bundle ends with: AppRegistry.registerComponent('main', App)
20. Expo Go's native shell picks up the registration
21. App component renders → React reconciler creates native views
22. Splash screen disappears, your auth screen / dashboard appears
```

### Phase 3 — Runtime (every API call from now on)

```
23. App calls fetch('https://vitaltrack-api-staging.onrender.com/api/v1/auth/me',
                  { headers: { Authorization: 'Bearer ...' } })
24. Hermes hands the request to React Native's native fetch implementation
25. Native fetch issues an HTTPS request — over the phone's own internet
    (Wi-Fi or LTE), NOT over the USB cable
26. DNS resolves vitaltrack-api-staging.onrender.com → Render's edge IP
27. TLS handshake. Encrypted request travels over the public internet
28. Render's load balancer routes to your staging FastAPI container
29. FastAPI authenticates the JWT, queries Postgres (Neon), returns JSON
30. Response comes back over the internet → phone's Wi-Fi/LTE → app fetch resolves
31. TanStack Query stores the result in cache, components re-render with data
```

### Phase 4 — Live edit cycle (every code change you save)

```
32. You edit a .tsx file in VS Code, save
33. Metro's file watcher detects the change
34. Metro recomputes which parts of the bundle changed (incremental rebuild,
    fast — typically under 1 second)
35. Metro pushes a "hot update" message to Expo Go via WebSocket on port 8081
    (also tunneled via adb reverse if USB mode)
36. Expo Go applies the patch — Hermes reloads the changed modules
37. React reconciler re-renders affected components
38. You see your change without restarting the app, in seconds
```

**The USB cable is involved in steps 9-16 (initial bundle load) and 35 (hot reload).**
**The internet is involved in steps 23-30 (API calls).**
**The cable and the internet are unrelated.** You can unplug USB after the bundle loads and the app keeps working until you change code.

---

## 6. Step-by-step setup, with the "why" behind each command

Here's the same sequence as Phase 1 above, but with each command annotated.

### Step 1 — One-time prerequisites

#### On the phone

```
Settings → About Phone → Build Number → tap 7 times → "You are now a developer!"
Settings → Developer Options → USB Debugging → ON
```

**Why**: USB Debugging starts the `adbd` daemon on the phone. Without it, `adb` commands have nothing to talk to.

```
Install Expo Go from the Play Store
```

**Why**: Expo Go is the native shell that will load your JS bundle. You only need to do this once per phone.

#### On the laptop

```
Install Android SDK Platform Tools (gives you adb.exe)
Add to PATH: C:\platform-tools  (or wherever you extracted it)
```

**Why**: Without `adb` on your PATH, you can't run any of the commands below from PowerShell.

```bash
cd vitaltrack-mobile
npm install --legacy-peer-deps
```

**Why**: Installs all JS dependencies. `--legacy-peer-deps` tells npm to be lenient with React Native's mismatched peer-dependency versions (a known quirk of the RN ecosystem).

### Step 2 — Plug in the phone, authorize ADB

```
Plug USB cable from phone to laptop
```

**Why**: Establishes the physical channel. Use a *data* cable, not charge-only — many bundled USB-C cables only carry power.

```
On the phone, accept the "Allow USB debugging?" dialog
Tick "Always allow from this computer"
```

**Why**: The phone's `adbd` daemon refuses commands from any computer it doesn't trust. The dialog shows your laptop's RSA key fingerprint; tapping Allow stores the key on the phone permanently (until you revoke it).

```bash
adb devices
```

**Why**: Lists every Android device the laptop can see. Should show your phone with status `device`. If `unauthorized`, you missed step 2 — re-plug and look for the dialog. If empty, the phone isn't being detected at all (cable, driver, port).

### Step 3 — Set up the USB tunnel

```bash
adb reverse tcp:8081 tcp:8081
```

**Why**: This is the core trick of USB mode. It tells the phone's `adbd`: "any time you see a TCP connection request to your own localhost:8081, don't try to find a server on yourself — instead, tunnel the connection over USB back to the laptop's localhost:8081."

After this command, when Expo Go tries to fetch the bundle from `localhost:8081`, the request silently travels through USB to your laptop where Metro is listening.

You can verify the rule exists:

```bash
adb reverse --list
```

Output:
```
(reverse) tcp:8081 tcp:8081
```

**ADB reverse is not sticky.** It's lost when the phone is unplugged, the phone reboots, the laptop reboots, or `adb kill-server` is run. After any of those, re-run the command.

If you also want the phone to reach a *local Docker backend* on your laptop, add:

```bash
adb reverse tcp:8000 tcp:8000
```

**Why**: Same trick, different port. Now `localhost:8000` on the phone reaches the FastAPI backend in Docker on the laptop. Skip this if you're hitting staging/prod (those are real public URLs reached over the phone's Wi-Fi).

### Step 4 — Start Metro with the right backend

```bash
cd vitaltrack-mobile
npm run start:staging
```

**Why** — unpacking the script:

```
npm run start:staging
  └─→ runs the "start:staging" script from package.json
  └─→ which is: cross-env EXPO_PUBLIC_API_URL=https://... expo start --clear
       │                  │                                  │            │
       │                  │                                  │            └─ flush Metro cache
       │                  │                                  │              (necessary after any
       │                  │                                  │               .env or env-var change)
       │                  │                                  │
       │                  │                                  └─ start the Expo dev server
       │                  │                                    (which is Metro + a few extras)
       │                  │
       │                  └─ set the env var for this Metro process. The
       │                    bundle Metro builds will see this value at
       │                    process.env.EXPO_PUBLIC_API_URL — that's how
       │                    services/api.ts knows which backend to hit.
       │
       └─ cross-platform helper that sets env vars (Windows uses different
         syntax than macOS/Linux; cross-env normalises this)
```

Metro boots. Terminal prints something like:

```
› Metro waiting on exp://localhost:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)
```

The QR code encodes that `exp://...` URL.

### Step 5 — Connect Expo Go

Two options:

**Option A — Scan the QR code.**
Open Expo Go on the phone. There's a "Scan QR code" button. Point at the QR code in your terminal. Expo Go opens.

**Option B — Type the URL manually.**
Open Expo Go. There's a URL input field. Type `exp://localhost:8081` (only works in USB mode because of the adb reverse) or `exp://YOUR_LAN_IP:8081` (LAN mode).

Either way:

```
Expo Go fetches the bundle from Metro
Bundle is loaded into Hermes
App starts
```

You'll see a loading indicator while the bundle downloads (~10 MB), then your app's splash screen, then the auth or dashboard screen.

### Step 6 — Verify it actually works

In the app, do something that calls the API — log in, scroll the dashboard, edit an item. If you see real data, the entire chain is working: Metro served the bundle, Expo Go executed it, the app reached the backend over the phone's internet, the backend returned data, the cache populated, the UI rendered.

If you see "Connecting…" or "Network request failed", something's broken in the chain. The next section helps you find which link.

---

## 7. Three things that confuse everyone

### 7.1 `localhost` is ambiguous

`localhost` is not a global address. It always means *this machine*. So:

- On the laptop: `localhost` = the laptop. Hitting `http://localhost:8000` = the laptop's port 8000 (where Docker forwards to your FastAPI backend).
- On the phone: `localhost` = the phone. Hitting `http://localhost:8000` = the phone's port 8000, where there's nothing.

`adb reverse tcp:8000 tcp:8000` is the bridge — it makes the phone's `localhost:8000` *forward to* the laptop's `localhost:8000` over USB.

This is why USB mode uses `EXPO_PUBLIC_API_URL=http://localhost:8000` (the bridge handles it) and Wi-Fi mode uses `EXPO_PUBLIC_API_URL=http://192.168.1.5:8000` (the actual LAN IP of the laptop). Mix them up and the app silently can't reach the backend.

### 7.2 The USB cable carries code, not data

A common confusion: "I'm on USB, why doesn't the phone reach my Docker backend?"

The USB cable carries **Metro traffic** — the JS bundle and hot-reload patches. It is *not* a general internet pipe for the phone.

For the API:
- If `EXPO_PUBLIC_API_URL` is `http://localhost:8000`, the phone tries to reach localhost:8000 — works only if `adb reverse tcp:8000 tcp:8000` was set up.
- If `EXPO_PUBLIC_API_URL` is `https://vitaltrack-api-staging.onrender.com`, the phone reaches Render's servers over the *phone's own Wi-Fi/LTE*. The USB cable is irrelevant for this traffic.

So you can be in USB mode (Metro over USB) AND hitting staging (API over Wi-Fi) at the same time. Two independent channels.

### 7.3 Metro and the backend are unrelated

Metro serves your JavaScript code. The backend serves your data. They run on different machines (Metro = your laptop, backend = Render or your local Docker), different ports (8081 vs 443/8000), different protocols (HTTP from Metro vs HTTPS from Render).

When the app loads, *both* are involved — Metro to deliver the code, then the backend to deliver the data once the code is running. But they don't know about each other and they don't share state.

If your dashboard is empty, the question is: did Metro deliver the bundle (yes, the app rendered) but the backend isn't responding? Or did Metro fail (the app shows "Network request failed" loading the bundle)? These are very different problems. Knowing which side broke is half of debugging.

---

## 8. Glossary

| Term | What it is |
|---|---|
| **APK** | Android Package — the binary format Android apps ship as. |
| **AAB** | Android App Bundle — Play Store's preferred format. EAS builds these for production. |
| **adb** | Android Debug Bridge — the laptop's CLI tool for talking to a connected Android phone. |
| **adbd** | The daemon running on the phone (when USB Debugging is enabled) that receives `adb` commands. |
| **Bridge** (React Native) | The serialisation layer that lets JavaScript and native code communicate. Newer RN versions use *JSI* — same concept, more direct binding. |
| **Bundle** | The single big `.js` file Metro produces by combining all your source files + dependencies. |
| **EAS** | Expo Application Services — the cloud service that builds production APKs/AABs. |
| **EAS Build** | The specific service that takes your code and produces an APK/AAB. Run with `eas build`. |
| **Expo Go** | The generic native shell installed from the Play Store. Loads any compatible JS bundle from a Metro server. |
| **Expo SDK** | The set of native modules Expo provides (camera, file system, secure store, etc.) — all bundled into Expo Go's shell. |
| **Hermes** | A small, fast JavaScript engine built by Facebook for React Native. Lives inside Expo Go. |
| **Hot reload** | Mechanism where Metro pushes only the changed parts of the bundle to Expo Go on save, applied without restarting the app. |
| **LAN mode** | Connection mode where the phone reaches the laptop over Wi-Fi using the laptop's LAN IP. Default for `expo start`. |
| **localhost** | The hostname for the local machine. Means different things on different machines. |
| **Metro** | The JavaScript bundler purpose-built for React Native. Serves bundles + hot updates over HTTP/WebSocket on port 8081. |
| **port 5037** | Default port for the laptop's `adb server` to listen on. |
| **port 8000** | What the FastAPI backend listens on (in Docker locally; Render uses standard 80/443 with internal routing). |
| **port 8081** | What Metro listens on. Hard-coded by Expo CLI but configurable. |
| **React Native** | The framework that lets you write apps in JS/TSX that compile to real native UI on iOS and Android. |
| **Tunnel mode** | Connection mode where Expo creates a public URL (`*.exp.direct`) so the phone reaches Metro over the internet. Slowest but most universal. |
| **USB Debugging** | Android setting that enables the `adbd` daemon. Required for any `adb` command to work. |
| **USB mode** | Connection mode where the phone is plugged into the laptop and `adb reverse` tunnels Metro traffic over USB. Most reliable. |
| **`adb reverse`** | The specific `adb` command that creates a port-forward from the phone's localhost back to the laptop's localhost. The trick that makes USB mode work. |
| **`exp://`** | URL scheme that tells Expo Go "this is a Metro dev server URL, fetch a bundle from it." |

---

## When something breaks

Use this doc to figure out **which layer is broken**, then jump to the operational guide for the fix:

| Symptom | Likely layer | Fix in |
|---|---|---|
| `adb devices` shows empty list | USB cable / driver | [USB_ADB_REVERSE_GUIDE §Troubleshooting](USB_ADB_REVERSE_GUIDE.md#troubleshooting) |
| `adb devices` shows `unauthorized` | Phone hasn't authorized this laptop | [USB_ADB_REVERSE_GUIDE §unauthorized](USB_ADB_REVERSE_GUIDE.md#unauthorized) |
| Metro starts but QR code can't be scanned | Network or firewall | [LOCAL_TESTING_COMPLETE_GUIDE §G](LOCAL_TESTING_COMPLETE_GUIDE.md#g--expo--metro-troubleshooting) |
| Bundle loads but app shows "Network request failed" | Backend unreachable from phone | [LOCAL_TESTING_COMPLETE_GUIDE §G](LOCAL_TESTING_COMPLETE_GUIDE.md#g--expo--metro-troubleshooting) |
| Edits not reflecting in app | Metro cache | `npx expo start --clear` |
| App stuck on splash screen | Bundle failed to load or app crashed during boot | Check Metro terminal for errors; shake phone for dev menu → reload |
| "Could not load… server is offline" | Metro stopped, or USB tunnel dropped | Restart `npm run start:*`, re-run `adb reverse` |

---

## See also

- **[LOCAL_TESTING_COMPLETE_GUIDE.md](LOCAL_TESTING_COMPLETE_GUIDE.md)** — operational reference: every command, every config file, every troubleshooting step.
- **[USB_ADB_REVERSE_GUIDE.md](USB_ADB_REVERSE_GUIDE.md)** — USB-specific setup and troubleshooting, including driver issues on Windows.
- **[NEW_DEVELOPER_QUICKSTART.md](NEW_DEVELOPER_QUICKSTART.md)** — 30-minute onramp if you're brand new.
- **[../CAREKOSH_DEVELOPER_GUIDE.md §1](../CAREKOSH_DEVELOPER_GUIDE.md#1-architecture-overview)** — the production architecture (server-first, no offline writes, etc.).
- **[EXPO_AND_PLAY_STORE_GUIDE.md](EXPO_AND_PLAY_STORE_GUIDE.md)** — when you're ready to graduate from Expo Go to a release APK/AAB.
