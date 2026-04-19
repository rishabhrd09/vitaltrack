# USB ADB Reverse Connection Guide

> **Most reliable way** to connect an Android device to your local CareKosh backend when Wi-Fi misbehaves.

The content here is toolchain-level (ADB + Expo), so it is unaffected by the CareKosh rebrand and server-first migration.

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
brew install android-platform-tools
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

No output = success.

### 3. Verify the forwards

```bash
adb reverse --list
```

Expected:
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

### 5. (Re)start Expo

```bash
cd vitaltrack-mobile
npx expo start --clear
```

`--clear` flushes Metro cache after the `.env` change.

### 6. Sanity-check from the phone

Open the phone browser and visit:
```
http://localhost:8000/health
```

Expected: `{"status":"healthy"}`

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
3. Expo restarted after the `.env` change (`npx expo start --clear`).
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

ADB reverse is **not sticky**. It resets when any of these happen:
- The phone is disconnected or rebooted
- The PC is rebooted
- The ADB server restarts (`adb kill-server`)

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

---

## Switching methods

**Wi-Fi → USB**
1. Plug in the phone.
2. `adb reverse tcp:8000 tcp:8000 && adb reverse tcp:8081 tcp:8081`
3. `.env` → `EXPO_PUBLIC_API_URL=http://localhost:8000`
4. `npx expo start --clear`

**USB → Wi-Fi**
1. Find your PC's LAN IP (`ipconfig` / `ifconfig`).
2. `.env` → `EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000`
3. `npx expo start --clear`
4. Optional: `adb reverse --remove-all`

---

**Pro tip:** keep USB connected while actively developing. You'll save yourself a dozen "why won't my phone connect" detours per week.
