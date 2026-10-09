# USB ADB Reverse Connection Guide

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

> **Most reliable way** to connect an Android device to your local CareKosh backend when Wi-Fi misbehaves.

The content here is toolchain-level (ADB + Expo), so it is unaffected by the CareKosh rebrand and server-first migration.

> **Status (re-checked 8 October 2026 against the working tree at `03cfebb`):** ports (API 8000, Metro 8081), the `localhost` fallback in `services/api.ts` and the `start:local` script still match the code. Corrected on 8 October: Metro must be started with `--localhost` for USB (earlier text omitted it), and `--clear` is not what applies a new API URL. ADB itself was not re-tested on a phone. This guide covers Expo Go and the JavaScript dev loop; the voice assistant on the feature branch needs the EAS-built `preview` APK instead. Main onboarding entry: [CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md).

> **New to ADB?** Read [LOCAL_TESTING_INTERNALS.md §3.3](LOCAL_TESTING_INTERNALS.md#33-adb--android-debug-bridge) and [§7.1](LOCAL_TESTING_INTERNALS.md#71-localhost-is-ambiguous) first (the illustrated, maintained edition is [local_testing_field_manual.html](local_testing_field_manual.html), §03.03 and §07.01). Those sections explain what `adb reverse` actually does at the network level and why `localhost` on the phone resolves differently from `localhost` on the laptop. The commands below will then read as logical consequences of that model, not magic incantations.

---

## When to use this

- Wi-Fi method is failing (router isolation, corporate network, firewall)
- You want a faster, more stable connection than Wi-Fi
- Phone and PC are on different networks and can't be joined
- You are debugging a network-layer issue

Trade-off vs Wi-Fi: the phone is tethered to the PC. For day-to-day dev that tether is fine; for demos to people not sitting at your desk, prefer Wi-Fi or EAS preview APK.

---

## Prerequisites

### On the Android device

1. **Enable Developer Options**
   - `Settings → About Phone → Build Number` — tap 7 times.
   - "You are now a developer!" appears.

2. **Enable USB Debugging**
   - `Settings → Developer Options → USB Debugging` → on.

3. **Connect via USB**
   - Use a **data cable** (not charge-only — many OEM cables are charge-only).
   - Accept the "Allow USB debugging?" prompt. Tick "Always allow from this computer".

### On the PC

**Windows**
1. Download [Android SDK Platform Tools](https://developer.android.com/studio/releases/platform-tools)
2. Extract to e.g. `C:\platform-tools`
3. Add to `PATH` (System Environment Variables → Path → Add `C:\platform-tools`)

**macOS**
```bash
brew install --cask android-platform-tools
```

**Linux**
```bash
sudo apt install adb
```

---

## Setup

### 1. Verify the phone is visible

```bash
adb devices
```

Expected:
```
List of devices attached
XXXXXXXX    device
```

Troubleshooting:
- `unauthorized` → check the phone for the "Allow USB debugging?" dialog.
- `no devices` → bad cable, wrong port, or missing driver (see "Troubleshooting" below).

### 2. Forward ports from the phone to the PC

```bash
adb reverse tcp:8000 tcp:8000      # CareKosh backend API
adb reverse tcp:8081 tcp:8081      # Expo Metro bundler
```

No error = success.

### 3. Verify the forwards

```bash
adb reverse --list
```

Expected (the first column varies by device):
```
(reverse) tcp:8000 tcp:8000
(reverse) tcp:8081 tcp:8081
```

### 4. Point the mobile app at `localhost`

Edit `vitaltrack-mobile/.env`:
```env
EXPO_PUBLIC_API_URL=http://localhost:8000
```

With `adb reverse` active, `localhost:8000` on the phone resolves to the PC's `localhost:8000`, i.e. the Docker-hosted backend.

Alternative without editing `.env`: `npm run start:local -- --localhost` in `vitaltrack-mobile/` sets `EXPO_PUBLIC_API_URL=http://localhost:8000` and starts Metro. Remove any `EXPO_PUBLIC_API_URL` line from `.env` first (for example the LAN IP that `setup-local-dev.sh` writes): in development a `.env` value overrides the script's value (read from the installed Expo SDK 54 code; not tested on a phone). If `EXPO_PUBLIC_API_URL` is not set at all, `services/api.ts` also falls back to `http://localhost:8000`.

### 5. (Re)start Expo

```bash
cd vitaltrack-mobile
npx expo start --localhost
```

`--localhost` makes the QR code point at `exp://127.0.0.1:8081`, which only the `adb reverse` tunnel can reach; without it Expo advertises your LAN address and the phone tries Wi-Fi. Use the port Metro prints, and reverse that port. After a `.env` edit a full app reload is enough; `--clear` (empty Metro's transform cache) is optional. (Earlier text used `npx expo start --clear` here.)

### 6. Sanity-check from the phone

Open the phone browser and visit:
```
http://localhost:8000/health
```

Expected: `/health` returns the DB-backed readiness object with `status`, `version`, `environment`, `database`, and `timestamp`; `database` should be `"connected"`. `/live` is the process-only liveness check and returns `database:"not_checked"`.

Then scan the QR from Expo Go.

---

## Troubleshooting

### "no devices found"

| Cause | Fix |
|---|---|
| Charge-only cable | Use a known-good data cable |
| USB hub / port issues | Plug directly into a USB-2 port on the PC |
| Windows driver missing | Install the [Google USB Driver](https://developer.android.com/studio/run/win-usb) |
| USB debugging disabled | Re-enable in Developer Options |

### "unauthorized"

1. Check the phone screen for the auth dialog.
2. Tick **Always allow from this computer** → **Allow**.

Still stuck?
1. On the phone: Developer Options → **Revoke USB debugging authorizations**.
2. Disconnect / reconnect. Accept the fresh prompt.

### `adb reverse` succeeds but the app can't reach the backend

1. Confirm: `adb reverse --list` shows both ports.
2. `.env` says `http://localhost:8000`, not an IP.
3. App fully reloaded after the `.env` change, Metro started with `--localhost`, and no `start:*` script fighting a different `.env` URL.
4. Backend is actually up: `curl http://localhost:8000/health` from the PC.

### "Connection reset" or "Connection refused"

Usually: ADB reverse expired (reboot, unplug, or `adb` server restart).

```bash
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
curl http://localhost:8000/health
```

---

## Persistence

ADB reverse is **not sticky**. In practice it resets when any of these happen (Android's documentation does not describe the rule's lifetime):
- The phone is disconnected or rebooted
- The PC is rebooted
- The ADB server restarts (`adb kill-server`)
- Expo CLI exits after you pressed `a` in it: it sets the Metro-port rule itself and removes it on exit

Re-run the two `adb reverse` commands after any of these.

---

## Quick setup script

Drop this in the repo root or your shell rc to avoid typing the commands every time.

**macOS / Linux — `setup-adb.sh`**
```bash
#!/bin/bash
set -e
echo "Setting up ADB reverse for CareKosh…"
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
echo "Active forwards:"
adb reverse --list
```

**Windows — `setup-adb.bat`**
```batch
@echo off
echo Setting up ADB reverse for CareKosh...
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
echo Active forwards:
adb reverse --list
pause
```

---

## Command reference

```bash
adb devices                              # list connected devices
adb reverse tcp:8000 tcp:8000            # phone localhost:8000 → PC localhost:8000
adb reverse tcp:8081 tcp:8081            # Metro
adb reverse --list                       # active forwards
adb reverse --remove tcp:8000            # remove one
adb reverse --remove-all                 # remove all

adb kill-server && adb start-server      # reset the ADB server

adb version
adb shell                                # device shell (for debugging)
```

---

## Wi-Fi vs USB

| Aspect | Wi-Fi | USB (`adb reverse`) |
|---|---|---|
| Setup overhead | Lower | Higher (install ADB) |
| Speed | Depends on network | Consistently fast |
| Reliability | Depends on network | Very stable |
| Mobility | Phone can roam | Tethered |
| Firewall/router issues | Common | Bypassed |
| `.env` URL | `http://YOUR_LAN_IP:8000` | `http://localhost:8000` |
| Start Metro | `npx expo start` | `npx expo start --localhost` |

On the Android **emulator**, `http://10.0.2.2:8000` reaches the PC's `localhost:8000` without any `adb reverse` (10.0.2.2 is the emulator's alias for the host's loopback interface); `adb reverse` also works with emulators.

---

## Switching methods

**Wi-Fi → USB**
1. Plug in the phone.
2. `adb reverse tcp:8000 tcp:8000 && adb reverse tcp:8081 tcp:8081`
3. `.env` → `EXPO_PUBLIC_API_URL=http://localhost:8000`
4. `npx expo start --localhost`, then reload the app

**USB → Wi-Fi**
1. Find your PC's LAN IP (`ipconfig` / `ifconfig`).
2. `.env` → `EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000`
3. `npx expo start` (LAN is the default), then reload the app
4. Optional: `adb reverse --remove-all`

Over Wi-Fi the PC's firewall must allow inbound 8081 and 8000 (see [LOCAL_TESTING_COMPLETE_GUIDE §E](LOCAL_TESTING_COMPLETE_GUIDE.md#e--windows-firewall)).

---

**Pro tip:** keep USB connected while actively developing. You'll save yourself a dozen "why won't my phone connect" detours per week.
