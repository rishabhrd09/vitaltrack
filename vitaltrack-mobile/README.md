# 🏥 VitalTrack Mobile - Home ICU Inventory

**Phase 2 | React Native + Expo | Backend Integration Ready**

VitalTrack is a professional mobile application for managing Home ICU inventory. Track medical equipment, monitor stock levels, and generate purchase orders.

---

## ✨ Features

### Phase 1 (Local Storage)
- 📊 **Dashboard** - Real-time inventory overview
- 📦 **Inventory Management** - Categories & items CRUD
- ⚠️ **Stock Alerts** - Low stock & out of stock warnings
- 🔴 **Critical Equipment** - Special tracking for life-support items
- 📋 **Purchase Orders** - Generate & track orders
- 📄 **PDF Export** - Professional order sheets
- 🌙 **Dark Mode** - Medical-grade interface

### Phase 2 (NEW) ✨
- 🔐 **Login/Register** - Email or username authentication
- 🔑 **Password Reset** - Forgot password flow
- 📧 **Email Verification** - Account verification
- 🔄 **Token Management** - Secure JWT with auto-refresh
- ☁️ **Backend Sync** - Connect to VitalTrack API

---

## 🚀 Quick Start (TESTED ✅)

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ |
| npm | 9+ |
| Expo Go App | Latest (on phone) |

### Installation

```bash
# 1. Navigate to project
cd vitaltrack-mobile-main

# 2. Install dependencies (IMPORTANT: use --legacy-peer-deps)
npm install --legacy-peer-deps

# 3. Start development server
npx expo start --clear
```

> ⚠️ **IMPORTANT:** You MUST use `--legacy-peer-deps` flag. Regular `npm install` will fail due to React 19 peer dependency conflicts.

### Run on Device

1. Open **Expo Go** app on your phone
2. Scan the **QR code** shown in terminal
3. Ensure phone & computer on **same WiFi network**

---

## 🔧 Backend Configuration

To connect to the VitalTrack backend API:

### 1. Create Environment File

Create `.env` in project root:

```ini
# For physical device - use your computer's IPv4 address
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000

# For Android Emulator only
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000

# For iOS Simulator
EXPO_PUBLIC_API_URL=http://localhost:8000
```

### 2. Find Your IP Address

**Windows:**
```powershell
ipconfig
# Look for: IPv4 Address under "Wireless LAN adapter Wi-Fi"
```

**Mac:**
```bash
ipconfig getifaddr en0
```

### 3. Verify Backend is Running

```bash
curl http://YOUR_IP:8000/health
# Should return: {"status":"healthy"...}
```

---

## 📁 Project Structure

```
vitaltrack-mobile/
├── app/                    # Screens (Expo Router)
│   ├── (auth)/             # Auth screens (Phase 2)
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   ├── forgot-password.tsx
│   │   └── reset-password.tsx
│   ├── (tabs)/             # Main app tabs
│   │   ├── index.tsx       # Dashboard
│   │   ├── inventory.tsx   # Item list
│   │   └── orders.tsx      # Order list
│   ├── item/               # Item details
│   └── order/              # Order screens
├── components/             # Reusable components
├── services/               # API layer (Phase 2)
│   ├── api.ts              # HTTP client with JWT
│   └── auth.ts             # Auth service
├── store/                  # State management
│   ├── useAppStore.ts      # App state (Zustand)
│   └── useAuthStore.ts     # Auth state (Phase 2)
├── types/                  # TypeScript types
├── theme/                  # Design system
└── utils/                  # Helpers
```

---

## 🔐 Authentication (Phase 2)

### Available Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Login | `/(auth)/login` | Email/username login |
| Register | `/(auth)/register` | New account creation |
| Forgot Password | `/(auth)/forgot-password` | Request reset email |
| Reset Password | `/(auth)/reset-password` | Enter new password |

### API Endpoints Used

| Feature | Endpoint |
|---------|----------|
| Register | `POST /api/v1/auth/register` |
| Login | `POST /api/v1/auth/login` |
| Logout | `POST /api/v1/auth/logout` |
| Get Profile | `GET /api/v1/auth/me` |
| Forgot Password | `POST /api/v1/auth/forgot-password` |
| Reset Password | `POST /api/v1/auth/reset-password` |

---

## 🐛 Troubleshooting

### npm install fails with ERESOLVE error

```bash
# This is expected - use legacy-peer-deps
npm install --legacy-peer-deps
```

### "Network request failed" when connecting to backend

1. Verify backend is running: `http://localhost:8000/health`
2. Check `.env` has your computer's IP (not `localhost` for physical device)
3. Ensure phone & computer on **same WiFi network**
4. Check Windows Firewall isn't blocking port 8000

### TypeScript or Metro errors

```bash
# Clear cache and restart
npx expo start --clear
```

### Images not showing

```bash
npx expo start --clear
```

---

## 📋 TODO (Phase 3)

- [ ] Add auth guard to `app/_layout.tsx`
- [ ] Profile screen with edit capability
- [ ] Replace local storage with API calls
- [ ] Implement offline sync queue
- [ ] Add sync status indicator

---

## 📄 License

This project is for personal/private use for Home ICU management.

---

**VitalTrack v2.0.0 - Phase 2 Complete** ✅
