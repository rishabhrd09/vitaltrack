# VitalTrack Mobile - Phase 1 Complete Setup & Testing Guide

## 🎯 Phase 1 Overview

**Goal:** Complete Expo React Native frontend with local storage, tested on real Android device using Expo Go

**What's Included:**
- ✅ All 5 screens (Dashboard, Inventory, Orders, Item Form, Create Order)
- ✅ Zustand store with AsyncStorage persistence
- ✅ Exact color theme matching Kotlin app
- ✅ PDF generation with expo-print
- ✅ Full CRUD operations
- ✅ Ready to test on Expo Go

**SDK Version:** This project is configured for **Expo SDK 54** (January 2026)

---

## 📱 Step 1: Install Expo Go on Your Phone

1. **Open Google Play Store** on your Android phone
2. **Search for "Expo Go"**
3. **Install the app** (it's free, by Expo)
4. **Open Expo Go** and create an account (optional but recommended)

> [!IMPORTANT]
> Make sure your Expo Go app is updated to the latest version (SDK 54). If you have an older version, the app won't load.

---

## 💻 Step 2: Setup Development Environment

### Prerequisites
- Node.js 18+ installed
- npm installed
- Any code editor (VS Code recommended)

### Clone/Copy the Project

```bash
# Navigate to where you want the project
cd ~/projects

# Create the project folder
mkdir vitaltrack-mobile
cd vitaltrack-mobile

# Copy all the files from this implementation
```

### Install Dependencies

```bash
# Install all packages with legacy peer deps flag (required for SDK 54)
npm install --legacy-peer-deps

# If you get peer dependency errors, always use:
npm install --legacy-peer-deps
```

> [!NOTE]
> The `--legacy-peer-deps` flag is required because some SDK 54 packages have conflicting peer dependencies. This is safe to use and won't affect functionality.

---

## 🚀 Step 3: Start Development Server

### Option A: Tunnel Mode (Recommended for First Run)

Tunnel mode creates a public URL that works across networks and bypasses firewall issues:

```bash
npx expo start --tunnel --clear
```

When prompted to install `@expo/ngrok`, type `Y` and press Enter.

### Option B: Local Network Mode

If your phone and computer are on the same WiFi network:

```bash
npx expo start --clear
```

### What You'll See:

```
Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Using Expo Go
› Press s │ switch to development build

› Press a │ open Android
› Press w │ open web

› Press j │ open debugger
› Press r │ reload app
› Press m │ toggle menu
```

---

## 📲 Step 4: Test on Your Phone

### Option A: QR Code (Recommended)
1. Open **Expo Go** app on your phone
2. Tap **"Scan QR Code"**
3. Scan the QR code shown in your terminal
4. App will load in ~10-30 seconds

### Option B: Same Network
1. Make sure phone and computer are on **same WiFi**
2. In Expo Go, you'll see your project listed under "Recently opened"
3. Tap to open

### Troubleshooting Connection Issues:

```bash
# If QR code doesn't work, try tunnel mode:
npx expo start --tunnel

# If you get "java.io.exception failed to download remote update":
# Use tunnel mode - it bypasses local network issues

# Clear cache and restart:
npx expo start --clear
```

---

## ✅ Step 5: Testing Checklist

### 5.1 Dashboard Screen Tests

| Test | How to Verify | Expected Result |
|------|---------------|-----------------|
| Stats display | Open app | See 4 stat cards with counts |
| Total items | Count should match inventory | Number matches items in Inventory tab |
| Tap Total Items | Tap the card | Navigates to Inventory tab |
| Tap Out of Stock | Tap the card | Scrolls to Needs Attention section |
| Needs Attention | Check section | Shows out of stock + low stock items |
| Empty state | If all stocked | Shows "All stocked up!" message |
| Recent Activity | Check bottom | Shows recent actions (empty initially) |

### 5.2 Inventory Screen Tests

| Test | How to Verify | Expected Result |
|------|---------------|-----------------|
| Categories load | Open Inventory tab | See 8 default categories |
| Expand/Collapse | Tap category header | Items show/hide smoothly |
| Item counts | Check badges | Each category shows item count |
| Status badges | Check categories | Shows "X out" or "X low" if applicable |
| Search | Type in search bar | Filters items in real-time |
| Search expand | Search for item | Auto-expands matching categories |
| Clear search | Tap X button | Clears and shows all |
| View mode toggle | Tap "All Items" | Shows flat list of all items |
| Add button | Tap + button | Opens Item Form |
| Edit item | Tap pencil on item row | Opens Item Form with data |

### 5.3 Item Form Tests

| Test | How to Verify | Expected Result |
|------|---------------|-----------------|
| New item | Tap + anywhere | Form opens empty |
| Category picker | Tap category field | Shows dropdown with all categories |
| Unit picker | Tap unit field | Shows dropdown with common units |
| Save new | Fill name, tap Save | Creates item, shows success |
| Validation | Try save without name | Shows error alert |
| Edit item | Open existing item | Form pre-filled with data |
| Update | Change data, save | Updates item, shows success |
| Delete | Tap delete button | Shows confirm dialog |
| Confirm delete | Tap Delete | Removes item, returns to list |

### 5.4 Orders Screen Tests

| Test | How to Verify | Expected Result |
|------|---------------|-----------------|
| Empty state | With no orders | Shows "No orders yet" |
| Create button | Tap Create Order | Opens Create Order screen |
| Order card | After creating order | Shows order ID, status, counts |
| Expand order | Tap order card | Shows items, timeline, actions |
| Mark received | Tap "Have you received?" | Changes status to "Received" |
| Update stock | On received order | Adds quantities to inventory |
| Delete order | Tap Remove | Removes from list |

### 5.5 Create Order Screen Tests

| Test | How to Verify | Expected Result |
|------|---------------|-----------------|
| Items load | Open with low stock items | Shows all items needing order |
| Empty state | With all items stocked | Shows "All Stocked Up!" |
| Toggle items | Tap checkbox | Selects/deselects item |
| Select All | Tap button | Selects all items |
| Select None | Tap button | Deselects all items |
| Quantity +/- | Tap buttons | Increments/decrements |
| Quantity input | Type number | Updates quantity |
| Summary | Check bottom | Shows correct totals |
| Generate PDF | Tap button | Opens share dialog |
| PDF content | Open shared PDF | Shows all selected items |

### 5.6 Data Persistence Tests

| Test | How to Verify | Expected Result |
|------|---------------|-----------------|
| Add item | Create new item | Item appears in list |
| Close app | Force close Expo Go | - |
| Reopen app | Open from Expo Go | Item still exists |
| Edit item | Change quantity | Change persists after reload |
| Activity log | Check dashboard | Shows logged activity |

---

## 🐛 Common Issues & Solutions

### Issue: "Project is incompatible with this version of Expo Go"

**Cause:** SDK version mismatch between project and Expo Go app.

**Solution:**
1. Check your Expo Go version (should be SDK 54)
2. If project is older, run: `npx expo install expo@latest --fix`
3. Update all dependencies: `npx expo install --fix`

### Issue: "Unable to resolve module"
```bash
# Clear cache and restart
npx expo start --clear
```

### Issue: App not connecting to phone
```bash
# Try tunnel mode (recommended)
npx expo start --tunnel

# Or ensure same WiFi network
# Check firewall isn't blocking port 8081
```

### Issue: "java.io.exception failed to download remote update"
```bash
# Use tunnel mode - bypasses local network issues
npx expo start --tunnel
```

### Issue: "crypto.getRandomValues() not supported"

**Cause:** The `uuid` package uses browser APIs not available in React Native.

**Solution:** This project uses `expo-crypto` instead. If you modified the code:
```typescript
// Use this in utils/helpers.ts
import * as Crypto from 'expo-crypto';
export const generateId = (): string => Crypto.randomUUID();
```

### Issue: AsyncStorage errors
```bash
# Reinstall the package
npm uninstall @react-native-async-storage/async-storage
npx expo install @react-native-async-storage/async-storage
```

### Issue: Blank screen on load
```bash
# Check terminal for errors
# Usually a syntax error in code
# Fix error and reload (press r in terminal)
```

### Issue: TypeScript errors
```bash
# Check tsconfig.json exists
# Run type check
npx tsc --noEmit
```

### Issue: Peer dependency conflicts
```bash
# Always use legacy peer deps flag
npm install --legacy-peer-deps
```

---

## 📊 Test Data Setup

To properly test, you need some items in different states:

### Create Test Scenarios:

1. **Out of Stock Item:**
   - Add item with quantity = 0, minimumStock = 5

2. **Low Stock Item:**
   - Add item with quantity = 2, minimumStock = 10

3. **Well Stocked Item:**
   - Add item with quantity = 20, minimumStock = 5

4. **Critical Equipment:**
   - Add item named "BiPAP Machine" with quantity = 1, minimumStock = 1
   - Should show "Backup Available" instead of "Low Stock"

---

## 📁 Project File Structure

```
vitaltrack-mobile/
├── app/                          # Screens (Expo Router)
│   ├── _layout.tsx               # Root layout
│   ├── (tabs)/                   # Tab navigation
│   │   ├── _layout.tsx           # Tab bar config
│   │   ├── index.tsx             # Dashboard
│   │   ├── inventory.tsx         # Inventory list
│   │   └── orders.tsx            # Orders list
│   ├── item/
│   │   └── [id].tsx              # Item form
│   └── order/
│       └── create.tsx            # Create order
├── components/                   # Reusable components
│   ├── dashboard/
│   │   ├── StatsCard.tsx
│   │   ├── NeedsAttention.tsx
│   │   └── ActivityList.tsx
│   ├── inventory/
│   │   ├── CategoryHeader.tsx
│   │   └── ItemRow.tsx
│   └── orders/
│       └── OrderCard.tsx
├── store/
│   └── useAppStore.ts            # Zustand store
├── types/
│   └── index.ts                  # TypeScript types
├── theme/
│   ├── colors.ts                 # Color palette
│   └── spacing.ts                # Spacing/sizing
├── utils/
│   └── helpers.ts                # Utility functions
├── data/
│   └── seedData.ts               # Default data
├── assets/                       # App icons and images
│   ├── icon.png                  # Main app icon
│   ├── adaptive-icon.png         # Android adaptive icon
│   ├── splash-icon.png           # Splash screen icon
│   └── favicon.png               # Web favicon
├── app.json                      # Expo config
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── ADDITIONAL_CHANGES.md         # Troubleshooting log
└── PHASE1_SETUP_GUIDE.md         # This file
```

---

## 📦 Required Dependencies (SDK 54)

```json
{
  "dependencies": {
    "@expo/vector-icons": "^15.0.3",
    "@react-native-async-storage/async-storage": "2.2.0",
    "@react-navigation/native": "^7.0.14",
    "date-fns": "^3.6.0",
    "expo": "^54.0.31",
    "expo-asset": "~12.0.12",
    "expo-constants": "~18.0.13",
    "expo-crypto": "~14.0.3",
    "expo-document-picker": "~14.0.8",
    "expo-file-system": "~19.0.21",
    "expo-haptics": "~15.0.8",
    "expo-image-picker": "~17.0.10",
    "expo-linking": "~8.0.11",
    "expo-print": "~15.0.8",
    "expo-router": "~6.0.21",
    "expo-sharing": "~14.0.8",
    "expo-status-bar": "~3.0.9",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-reanimated": "~4.1.1",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-worklets": "0.5.1",
    "uuid": "^9.0.1",
    "zustand": "^4.5.2"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@types/react": "~19.1.10",
    "@types/uuid": "^9.0.8",
    "typescript": "~5.9.2"
  }
}
```

---

## ✨ Success Criteria for Phase 1

Before moving to Phase 2, verify:

- [ ] App loads on Expo Go without crashes
- [ ] All 5 screens are accessible and functional
- [ ] Data persists after app restart
- [ ] Can create, edit, delete items
- [ ] Can create orders and generate PDFs
- [ ] Order status flow works (Pending → Received → Stock Updated)
- [ ] Search filters items correctly
- [ ] Theme colors match design (dark theme)
- [ ] Activity log records actions

---

## 🔜 Next Steps (Phase 2 Preview)

Once Phase 1 is fully tested:

1. **Backend Setup**
   - Create FastAPI project
   - Define API endpoints matching frontend data models
   - Setup PostgreSQL database
   - Implement JWT authentication

2. **API Integration**
   - Add API service layer to React Native app
   - Implement online/offline detection
   - Build sync queue for offline changes
   - Handle conflict resolution

3. **Authentication**
   - Add login/register screens
   - Secure token storage with expo-secure-store
   - Implement refresh token flow

---

## 📞 Getting Help

If you encounter issues:

1. **Check terminal** for error messages
2. **Press `r`** to reload the app
3. **Press `m`** to open developer menu
4. **Run `npx expo doctor`** to check for issues
5. **Check ADDITIONAL_CHANGES.md** for documented solutions
6. **Check Expo docs**: https://docs.expo.dev

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Jan 2026 | Initial SDK 52 setup |
| 1.1.0 | Jan 2026 | Upgraded to SDK 54, fixed UUID, added assets |

---

**Ready to test!** Start the server with `npx expo start --tunnel --clear` and scan the QR code with Expo Go.
