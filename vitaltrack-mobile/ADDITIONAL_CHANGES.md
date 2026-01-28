# VitalTrack Mobile - Additional Changes & Troubleshooting Log

This document records all the problems encountered during the initial setup and the solutions applied to get the Expo Go app running successfully.

---

## 📋 Summary of Issues & Solutions

| Issue | Root Cause | Solution |
|-------|------------|----------|
| "Something is wrong" in Expo Go | SDK version mismatch | Upgraded from SDK 52 to SDK 54 |
| Package version warnings | Outdated dependencies | Ran `npx expo install --fix` |
| Network connection failed | Firewall/local network issues | Used tunnel mode `--tunnel` |
| Missing `react-native-worklets` | SDK 54 reanimated dependency | Installed package explicitly |
| Missing asset files | Empty assets folder | Created icon.png and related files |
| React version conflict | react@19.2.3 vs expected 19.1.0 | Set react to exact version 19.1.0 |
| `newArchEnabled` warning | Deprecated in Expo Go | Removed from app.json |
| UUID crypto error | uuid package uses browser APIs | Replaced with expo-crypto |

---

## 🔧 Detailed Problem & Solution Log

### Problem 1: SDK Version Mismatch

**Error:**
```
Project is incompatible with this version of Expo Go
- The installed version of Expo Go is for SDK 54
- The project you opened uses SDK 52
```

**Root Cause:**
The original `package.json` was created for Expo SDK 52, but the Expo Go app on the phone was updated to SDK 54.

**Solution:**
Updated `package.json` dependencies to SDK 54 compatible versions:

```json
// Before (SDK 52)
"expo": "~52.0.0",
"react": "18.3.1",
"react-native": "0.76.6",

// After (SDK 54)
"expo": "^54.0.31",
"react": "19.1.0",
"react-native": "0.81.5",
```

**Full updated dependencies:**
- `@expo/vector-icons`: `^15.0.3`
- `@react-native-async-storage/async-storage`: `2.2.0`
- `@react-navigation/native`: `^7.0.14`
- `expo-asset`: `~12.0.12`
- `expo-constants`: `~18.0.13`
- `expo-document-picker`: `~14.0.8`
- `expo-file-system`: `~19.0.21`
- `expo-haptics`: `~15.0.8`
- `expo-image-picker`: `~17.0.10`
- `expo-linking`: `~8.0.11`
- `expo-print`: `~15.0.8`
- `expo-router`: `~6.0.21`
- `expo-sharing`: `~14.0.8`
- `expo-status-bar`: `~3.0.9`
- `react-native-gesture-handler`: `~2.28.0`
- `react-native-reanimated`: `~4.1.1`
- `react-native-safe-area-context`: `~5.6.0`
- `react-native-screens`: `~4.16.0`

---

### Problem 2: Network Connection Failed

**Error:**
```
java.io.exception failed to download remote update
```

**Root Cause:**
Local network firewall blocking connection between phone and development computer.

**Solution:**
Use tunnel mode which creates a public URL via ngrok:

```bash
npx expo start --tunnel
```

When prompted, install `@expo/ngrok` globally by typing `Y`.

---

### Problem 3: Missing react-native-worklets Module

**Error:**
```
Cannot find module 'react-native-worklets/plugin'
```

**Root Cause:**
SDK 54's `react-native-reanimated` requires `react-native-worklets` as a dependency.

**Solution:**
Install the package:

```bash
npm install react-native-worklets@0.5.1 --legacy-peer-deps
```

---

### Problem 4: Missing Asset Files

**Error:**
```
Unable to resolve asset "./assets/icon.png" from "icon" in your app.json
```

**Root Cause:**
The `assets/` folder was empty - missing required icon files.

**Solution:**
Created the following files in `assets/` folder:
- `icon.png` (1024x1024 app icon)
- `adaptive-icon.png` (Android adaptive icon)
- `splash-icon.png` (Splash screen icon)
- `favicon.png` (Web favicon)

---

### Problem 5: React Version Conflict

**Error:**
```
Incompatible React versions: The "react" and "react-native-renderer" packages must have exact same version.
- react: 19.2.3
- react-native-renderer: 19.1.0
```

**Root Cause:**
Attempted to upgrade react to 19.2.3 to fix peer dependency warnings, but SDK 54 specifically requires react@19.1.0.

**Solution:**
Set exact version in `package.json`:

```json
"react": "19.1.0",
```

---

### Problem 6: newArchEnabled Warning

**Warning:**
```
React Native's New Architecture is always enabled in Expo Go, but it is explicitly disabled in your project's app config.
```

**Root Cause:**
`app.json` had `"newArchEnabled": false` which conflicts with Expo Go's requirement.

**Solution:**
Removed the line from `app.json`:

```json
// Removed this line:
"newArchEnabled": false,
```

---

### Problem 7: UUID crypto.getRandomValues() Error

**Error:**
```
crypto.getRandomValues() not supported
```

**Root Cause:**
The `uuid` package (v9) uses browser-specific `crypto.getRandomValues()` which is not available in React Native.

**Solution:**
Replaced `uuid` with `expo-crypto` in `utils/helpers.ts`:

```typescript
// Before
import { v4 as uuidv4 } from 'uuid';
export const generateId = (): string => uuidv4();

// After
import * as Crypto from 'expo-crypto';
export const generateId = (): string => Crypto.randomUUID();
```

Also installed expo-crypto:
```bash
npx expo install expo-crypto
```

---

### Problem 8: Peer Dependency Conflicts

**Error:**
```
npm error ERESOLVE could not resolve
npm error peer @types/react@"^19.1.0" from react-native@0.81.5
```

**Root Cause:**
Conflicting TypeScript type definitions between packages.

**Solution:**
1. Updated `@types/react` to `~19.1.10`
2. Updated `typescript` to `~5.9.2`
3. Used `--legacy-peer-deps` flag during installation:

```bash
npm install --legacy-peer-deps
```

---

## 📁 Files Modified

### 1. `package.json`
- Upgraded all Expo SDK dependencies from 52 to 54
- Changed `react` from `18.3.1` to `19.1.0`
- Changed `react-native` from `0.76.6` to `0.81.5`
- Added `react-native-worklets@0.5.1`
- Updated `@types/react` to `~19.1.10`
- Updated `typescript` to `~5.9.2`

### 2. `app.json`
- Removed `"newArchEnabled": false`

### 3. `utils/helpers.ts`
- Replaced `uuid` import with `expo-crypto`
- Changed `generateId()` to use `Crypto.randomUUID()`

### 4. `assets/` folder
- Added `icon.png`
- Added `adaptive-icon.png`
- Added `splash-icon.png`
- Added `favicon.png`

---

## ✅ Working Setup Commands

After all fixes, use these commands to run the project:

```bash
# Navigate to project
cd vitaltrack-mobile

# Clean install (if having issues)
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm install --legacy-peer-deps

# Start with tunnel mode (recommended for first run)
npx expo start --tunnel --clear

# Or start normally (if on same network)
npx expo start --clear
```

---

## 📱 Expo Go Compatibility

| Expo Go Version | Required SDK | Status |
|-----------------|--------------|--------|
| SDK 54 (Current) | SDK 54 | ✅ Compatible |
| SDK 53 | SDK 53 | ❌ Not tested |
| SDK 52 | SDK 52 | ❌ Original version, outdated |

---

## 🔗 Useful Resources

- [Expo SDK 54 Release Notes](https://docs.expo.dev/changelog/sdk-54/)
- [React Native New Architecture](https://docs.expo.dev/guides/new-architecture/)
- [Expo Crypto Documentation](https://docs.expo.dev/versions/latest/sdk/crypto/)
- [Troubleshooting Expo Go Connection](https://docs.expo.dev/get-started/troubleshooting/)

---

*Last updated: January 15, 2026*
