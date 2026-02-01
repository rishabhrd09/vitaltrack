# USB ADB Reverse Connection Guide

> **Most reliable connection method** when WiFi doesn't work.

---

## When to Use This Method

✅ WiFi method not working (firewall, corporate network)  
✅ Want faster/more stable connection  
✅ Phone and PC can't be on same network  
✅ Debugging network issues  

---

## Prerequisites

### On Your Android Phone

1. **Enable Developer Options:**
   - Go to `Settings → About Phone`
   - Tap `Build Number` **7 times**
   - You'll see "You are now a developer!"

2. **Enable USB Debugging:**
   - Go to `Settings → Developer Options`
   - Enable `USB Debugging`

3. **Connect phone to PC via USB cable**
   - Use a **data cable** (not charge-only)
   - Accept "Allow USB debugging?" prompt on phone

### On Your PC

**Windows:**
1. Download [Android SDK Platform Tools](https://developer.android.com/studio/releases/platform-tools)
2. Extract to `C:\platform-tools`
3. Add to PATH or run from that directory

**Mac:**
```bash
brew install android-platform-tools
```

**Linux:**
```bash
sudo apt install adb
```

---

## Setup Steps

### Step 1: Verify Phone Connection

```bash
adb devices
```

**Expected output:**
```
List of devices attached
XXXXXXXX    device
```

❌ If `unauthorized`: Check phone for "Allow USB debugging" prompt  
❌ If `no devices`: Check USB cable, try different port, reinstall drivers

### Step 2: Create Reverse Port Forwarding

```bash
# Forward backend port
adb reverse tcp:8000 tcp:8000

# Forward Expo Metro port
adb reverse tcp:8081 tcp:8081
```

**Expected output:** (none, or shows port)

### Step 3: Verify Forwarding

```bash
adb reverse --list
```

**Expected output:**
```
(reverse) tcp:8000 tcp:8000
(reverse) tcp:8081 tcp:8081
```

### Step 4: Update Frontend .env

Edit `vitaltrack-mobile/.env`:
```env
EXPO_PUBLIC_API_URL=http://localhost:8000
```

⚠️ **With ADB reverse, phone accesses PC's localhost directly!**

### Step 5: Restart Expo

```bash
npx expo start --clear
```

### Step 6: Verify Connection

On your phone's browser, go to:
```
http://localhost:8000/health
```

✅ **Expected:** `{"status":"healthy"}`

Now scan the QR code with Expo Go.

---

## Troubleshooting

### Problem: "no devices found"

**Causes & Fixes:**
1. **Bad USB cable** - Use a data cable, not charge-only
2. **Wrong USB port** - Try a different port (preferably USB 2.0)
3. **Driver issues (Windows)** - Install [Google USB Driver](https://developer.android.com/studio/run/win-usb)
4. **USB debugging off** - Re-enable in Developer Options

### Problem: "unauthorized"

**Fix:**
1. Check phone screen for "Allow USB debugging?" popup
2. Tap "Always allow from this computer"
3. Tap "Allow"

**Still not working:**
1. Go to `Settings → Developer Options`
2. Tap "Revoke USB debugging authorizations"
3. Disconnect and reconnect phone
4. Accept the new prompt

### Problem: adb reverse works but app can't connect

**Debug Steps:**
1. Verify forwarding: `adb reverse --list`
2. Check .env says `localhost` not an IP
3. Restart Expo: `npx expo start --clear`
4. Verify backend is running: `curl http://localhost:8000/health`

### Problem: "Connection reset" or "Connection refused"

**Causes:**
1. ADB reverse expired (reconnect and redo)
2. Backend not running
3. Port conflict

**Fix:**
```bash
# Re-establish forwarding
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081

# Verify backend
curl http://localhost:8000/health
```

---

## Important: Persistence

**ADB reverse resets when:**
- Phone is disconnected
- Phone is restarted
- PC is restarted
- ADB server is restarted

**After any of these, re-run:**
```bash
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
```

---

## Quick Setup Script

Create `setup-adb.sh` (Mac/Linux) or `setup-adb.bat` (Windows):

**Mac/Linux:**
```bash
#!/bin/bash
echo "Setting up ADB reverse..."
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
echo "Done! Forwarding:"
adb reverse --list
```

**Windows:**
```batch
@echo off
echo Setting up ADB reverse...
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
echo Done! Forwarding:
adb reverse --list
pause
```

---

## Complete Command Reference

```bash
# List connected devices
adb devices

# Create port forwarding (phone → PC)
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081

# List active forwards
adb reverse --list

# Remove specific forward
adb reverse --remove tcp:8000

# Remove all forwards
adb reverse --remove-all

# Restart ADB server (if issues)
adb kill-server
adb start-server

# Check ADB version
adb version

# Get device shell (debugging)
adb shell
```

---

## WiFi vs USB Comparison

| Aspect | WiFi Method | USB Method |
|--------|-------------|------------|
| Setup | Easier | Requires ADB |
| Speed | Network dependent | Faster |
| Reliability | Can have issues | Very stable |
| Mobility | Phone can move | Tethered to PC |
| Firewall | Can be blocked | Bypasses firewall |
| .env URL | `http://IP:8000` | `http://localhost:8000` |

---

## Switching Between Methods

### From WiFi to USB:
1. Connect phone via USB
2. Run `adb reverse tcp:8000 tcp:8000`
3. Change `.env` to `http://localhost:8000`
4. Run `npx expo start --clear`

### From USB to WiFi:
1. Find your IP address
2. Change `.env` to `http://YOUR_IP:8000`
3. Run `npx expo start --clear`
4. (Optional) `adb reverse --remove-all`

---

**Tip:** Keep USB connected while developing for the most stable experience!
