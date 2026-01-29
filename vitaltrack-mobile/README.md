# VitalTrack Mobile

**Phase 3 Complete** | React Native + Expo | Production-Ready

[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org)

---

## Quick Start

### Prerequisites
| Requirement | Version |
|-------------|---------|
| Node.js | 18+ |
| npm | 9+ |
| Expo Go App | Latest (on phone) |

### Installation

```bash
cd vitaltrack-mobile

# Install dependencies (REQUIRED flag for React 19)
npm install --legacy-peer-deps

# Start development server
npx expo start --clear
```

> **IMPORTANT:** Always use `--legacy-peer-deps` flag. Regular `npm install` will fail due to React 19 peer dependency conflicts. You will see several "deprecated" warnings during install—this is normal and safe to ignore.

### Run on Device

1. Open **Expo Go** app on your phone
2. Scan the **QR code** shown in terminal
3. Ensure phone & computer on **same WiFi network**

---

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Real-time inventory overview with stats |
| **Inventory** | Categories & items with search/filter |
| **Stock Alerts** | Low stock & out of stock warnings |
| **Critical Items** | Special tracking for life-support equipment |
| **Orders** | Create & track restock orders |
| **PDF Export** | Professional order sheets |
| **Authentication** | Login, register, password reset |
| **Cloud Sync** | Backend integration with offline support |
| **Dark Mode** | Medical-grade dark interface |

---

## Project Structure

```
vitaltrack-mobile/
├── app/                    # Screens (Expo Router)
│   ├── (auth)/             # Auth screens
│   │   ├── login.tsx       # Login
│   │   ├── register.tsx    # Registration
│   │   ├── forgot-password.tsx
│   │   └── reset-password.tsx
│   ├── (tabs)/             # Main app tabs
│   │   ├── index.tsx       # Dashboard
│   │   ├── inventory.tsx   # Item list
│   │   └── orders.tsx      # Order list
│   ├── item/[id].tsx       # Item form
│   └── order/create.tsx    # Create order
├── components/             # Reusable components
├── services/               # API layer
│   ├── api.ts              # HTTP client with JWT
│   └── auth.ts             # Auth service
├── store/                  # State management
│   ├── useAppStore.ts      # App state (Zustand)
│   └── useAuthStore.ts     # Auth state
├── types/                  # TypeScript types
├── theme/                  # Design system
└── utils/                  # Helpers
```

---

## Backend Configuration

Create `.env` in project root:

```ini
# Physical device - use your computer's IPv4 address
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000

# Android Emulator
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000

# iOS Simulator
EXPO_PUBLIC_API_URL=http://localhost:8000
```

### Find Your IP Address

**Windows:**
```powershell
ipconfig
# Look for: IPv4 Address under "Wireless LAN adapter Wi-Fi"
```

**Mac:**
```bash
ipconfig getifaddr en0
```

---

## Authentication Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Login | `/(auth)/login` | Email/username login |
| Register | `/(auth)/register` | New account creation |
| Forgot Password | `/(auth)/forgot-password` | Request reset email |
| Reset Password | `/(auth)/reset-password` | Enter new password |

---

## Troubleshooting

### npm install fails with ERESOLVE error
```bash
npm install --legacy-peer-deps
```

### "Network request failed" connecting to backend
1. Verify backend running: `http://localhost:8000/health`
2. Check `.env` has your computer's IP (not localhost for physical device)
3. Ensure phone & computer on same WiFi
4. Check firewall isn't blocking port 8000

### Metro bundler errors
```bash
npx expo start --clear
```

### Tunnel mode (for network issues)
```bash
npx expo start --tunnel
```

---

## Deployment (EAS Build)

### Configure EAS
```bash
npm install -g eas-cli
eas login
```

### Build Preview APK
```bash
eas build --profile preview --platform android
```

### Build Production AAB
```bash
eas build --profile production --platform android
```

### Submit to Play Store
```bash
eas submit --platform android
```

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | React Native 0.81 |
| Platform | Expo SDK 54 |
| Language | TypeScript 5.9 |
| State | Zustand 4.5 |
| Navigation | Expo Router |
| Storage | AsyncStorage + SecureStore |
| PDF | expo-print |

---

## Key Dependencies

```json
{
  "expo": "^54.0.31",
  "react": "19.1.0",
  "react-native": "0.81.5",
  "expo-router": "~6.0.21",
  "zustand": "^4.5.2",
  "@react-native-async-storage/async-storage": "2.2.0",
  "expo-secure-store": "~14.0.8",
  "expo-print": "~15.0.8"
}
```

---

**VitalTrack Mobile v2.0.0** | Phase 3 Complete
