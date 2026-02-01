# VitalTrack Mobile

> React Native mobile app for VitalTrack medical inventory management.

[![React Native](https://img.shields.io/badge/React%20Native-0.76-61DAFB?logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript)](https://typescriptlang.org)

---

## Quick Start

### Prerequisites
- Node.js 20+
- Expo Go app on phone
- Backend running (see [Backend README](../vitaltrack-backend/README.md))

### Install & Run
```bash
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
```

Scan QR code with Expo Go to launch app.

---

## Project Structure

```
vitaltrack-mobile/
├── app/                        # Expo Router screens
│   ├── (auth)/                 # Auth screens (login, register)
│   ├── (tabs)/                 # Main tab screens
│   │   ├── index.tsx          # Dashboard
│   │   ├── inventory.tsx      # Inventory list
│   │   └── orders.tsx         # Orders list
│   ├── item/[id].tsx          # Item detail/edit
│   └── order/create.tsx       # Create order
├── components/
│   ├── common/                 # Shared components
│   ├── dashboard/              # Dashboard components
│   ├── inventory/              # Inventory components
│   └── orders/                 # Order components
├── services/                   # API & sync services
│   ├── api.ts                 # HTTP client
│   ├── auth.ts                # Auth service
│   └── sync.ts                # Offline sync
├── store/                      # Zustand stores
│   ├── useAppStore.ts         # Main app state
│   └── useAuthStore.ts        # Auth state
├── theme/                      # Design system
├── types/                      # TypeScript types
└── utils/                      # Helpers
```

---

## Key Features

### Offline-First Architecture
- Data stored locally in AsyncStorage
- Changes queued for sync when offline
- Automatic sync when online

### State Management (Zustand)
```typescript
// Example: Accessing store
const { items, createItem, updateStock } = useAppStore();

// Example: Creating item
const newItem = createItem({
  name: 'Oxygen Mask',
  quantity: 10,
  categoryId: 'xxx',
});
```

### Authentication
- JWT tokens stored in SecureStore
- Automatic token refresh
- Session persists across app restarts

---

## Screens

### Dashboard (`app/(tabs)/index.tsx`)
- Statistics cards (total items, low stock, out of stock)
- Needs Attention section (emergency alerts)
- Recent activity log

### Inventory (`app/(tabs)/inventory.tsx`)
- Category-grouped items
- Search and filter
- Quick stock update

### Item Detail (`app/item/[id].tsx`)
- Full item editor
- Stock management
- Delete confirmation

### Orders (`app/(tabs)/orders.tsx`)
- Order history
- Status tracking
- Apply to stock

### Create Order (`app/order/create.tsx`)
- Select low stock items
- Generate order
- Export options

---

## Components

### Critical Components

| Component | Location | Description |
|-----------|----------|-------------|
| `NeedsAttention` | `components/dashboard/` | Emergency backup alerts |
| `StatsCard` | `components/dashboard/` | Dashboard statistics |
| `ItemRow` | `components/inventory/` | Inventory list item |
| `OrderCard` | `components/orders/` | Order card |
| `VitalTrackTopBar` | `components/common/` | App header |

### Usage Example
```tsx
import NeedsAttention from '@/components/dashboard/NeedsAttention';

<NeedsAttention
  outOfStockItems={outOfStock}
  lowStockItems={lowStock}
  onOrderNow={() => router.push('/order/create')}
  onEditItem={(id) => router.push(`/item/${id}`)}
/>
```

---

## Services

### API Service (`services/api.ts`)
HTTP client with automatic token handling:
```typescript
const api = {
  async get<T>(endpoint: string): Promise<T>,
  async post<T>(endpoint: string, data: any): Promise<T>,
  async put<T>(endpoint: string, data: any): Promise<T>,
  async delete<T>(endpoint: string): Promise<T>,
};
```

### Sync Service (`services/sync.ts`)
Offline-first synchronization:
```typescript
// Push local changes
await syncService.push({
  categories: { created: [...], updated: [...], deleted: [...] },
  items: { created: [...], updated: [...], deleted: [...] },
});

// Pull server changes
const data = await syncService.pull();
```

### Auth Service (`services/auth.ts`)
Authentication operations:
```typescript
await authService.login(email, password);
await authService.register(email, password, name);
await authService.logout();
await authService.refreshToken();
```

---

## State Stores

### useAppStore
Main application state:
```typescript
interface AppState {
  categories: Category[];
  items: Item[];
  activityLogs: ActivityLog[];
  savedOrders: SavedOrder[];
  
  // Actions
  createItem(data: Partial<Item>): Item;
  updateItem(id: string, data: Partial<Item>): Item | null;
  deleteItem(id: string): void;
  updateStock(id: string, quantity: number): Item | null;
  
  // Computed
  getStats(): DashboardStats;
  getLowStockItems(): Item[];
  getOutOfStockItems(): Item[];
}
```

### useAuthStore
Authentication state:
```typescript
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  login(identifier: string, password: string): Promise<void>;
  register(data: RegisterData): Promise<void>;
  logout(): Promise<void>;
}
```

---

## Types

### Core Types (`types/index.ts`)

```typescript
interface Item {
  id: string;
  localId?: string;
  categoryId: string;
  name: string;
  quantity: number;
  unit: string;
  minimumStock: number;
  isCritical: boolean;
  // ... more fields
}

interface Category {
  id: string;
  localId?: string;
  name: string;
  displayOrder: number;
}

interface SavedOrder {
  id: string;
  orderId: string;
  items: OrderItem[];
  status: OrderStatus;
  totalItems: number;
  totalUnits: number;
}
```

### Helper Functions
```typescript
// Check if item is low stock
isLowStock(item: Item): boolean

// Check if item is critical equipment
isCriticalEquipment(item: Item): boolean

// Check if item needs emergency backup
needsEmergencyBackup(item: Item): boolean
```

---

## Environment Variables

Create `.env` file:
```env
EXPO_PUBLIC_API_URL=http://YOUR_IP:8000
```

**Important:** Restart Expo with `--clear` after changing `.env`

---

## Development

### Run Development Server
```bash
# Normal
npx expo start

# Clear cache (after .env changes)
npx expo start --clear

# Tunnel mode (firewall bypass)
npx expo start --tunnel
```

### Type Check
```bash
npx tsc --noEmit
```

### Lint
```bash
npm run lint
```

### Reset Everything
```bash
rm -rf node_modules .expo
npm install --legacy-peer-deps
npx expo start --clear
```

---

## Building

### Preview APK (Testing)
```bash
eas build --profile preview --platform android
```

### Production AAB (Play Store)
```bash
eas build --profile production --platform android
```

See [Deployment Guide](../docs/DEPLOYMENT_GUIDE.md) for full details.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Network request failed" | Check `.env` has correct IP, restart with `--clear` |
| "Unable to resolve module" | Delete `node_modules`, reinstall |
| Stuck on splash screen | Clear cache: `npx expo start --clear` |
| Changes not reflecting | Restart Metro with `--clear` |
| Auth token expired | Login again, check token refresh |

---

## Theme

### Colors (`theme/colors.ts`)
Groww-inspired dark theme:
```typescript
const colors = {
  bgPrimary: '#0E0E10',
  bgSecondary: '#1A1A1D',
  textPrimary: '#FFFFFF',
  accentGreen: '#00D09C',
  accentBlue: '#5367FF',
  statusRed: '#EB5757',
  statusOrange: '#F2994A',
};
```

### Spacing (`theme/spacing.ts`)
Consistent spacing scale:
```typescript
const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};
```

---

## Architecture Decisions

### Why Zustand?
- Simpler than Redux
- Built-in persistence
- TypeScript-first
- No boilerplate

### Why AsyncStorage for Activity Logs?
- Separate from main sync
- Per-user isolation
- Survives logout/login

### Why Offline-First?
- Medical caregivers can't depend on internet
- Data must be available during emergencies
- Sync when possible, work offline always

---

## License

This project is for educational and portfolio purposes.
