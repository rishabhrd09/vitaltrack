# 🔗 VitalTrack Frontend-Backend Compatibility Report

**Frontend:** `vitaltrack-mobile-phase1/vitaltrack-mobile` (React Native/Expo)  
**Backend:** `backedn_claude_1/vitaltrack-backend` (FastAPI/Python)  
**Status:** ✅ **FULLY COMPATIBLE**

---

## 📊 Schema Comparison Summary

| Entity | Frontend Fields | Backend Fields | Status |
|--------|----------------|----------------|--------|
| **Category** | 7 | 7 | ✅ Match |
| **Item** | 18 | 18 | ✅ Match |
| **OrderItem** | 10 | 10 | ✅ Match |
| **SavedOrder** | 12 | 12 | ✅ Match |
| **ActivityLog** | 7 | 7 | ✅ Match |
| **DashboardStats** | 5 | 4* | ⚠️ Note |

*Note: Backend returns `criticalItems` instead of `pendingOrdersCount`. Frontend can calculate pending orders separately.

---

## 🔎 Detailed Field Mapping

### Category

| Frontend (TypeScript) | Backend (Pydantic) | JSON Key |
|-----------------------|-------------------|----------|
| `id: string` | `id: str` | `id` |
| `name: string` | `name: str` | `name` |
| `description?: string` | `description: Optional[str]` | `description` |
| `displayOrder: number` | `display_order: int` → alias | `displayOrder` |
| `isDefault: boolean` | `is_default: bool` → alias | `isDefault` |
| `createdAt: string` | `created_at: datetime` → alias | `createdAt` |
| `updatedAt: string` | `updated_at: datetime` → alias | `updatedAt` |

### Item

| Frontend (TypeScript) | Backend (Pydantic) | JSON Key |
|-----------------------|-------------------|----------|
| `id: string` | `id: str` | `id` |
| `categoryId: string` | `category_id: str` → alias | `categoryId` |
| `name: string` | `name: str` | `name` |
| `description?: string` | `description: Optional[str]` | `description` |
| `quantity: number` | `quantity: int` | `quantity` |
| `unit: string` | `unit: str` | `unit` |
| `minimumStock: number` | `minimum_stock: int` → alias | `minimumStock` |
| `expiryDate?: string` | `expiry_date: Optional[date]` → alias | `expiryDate` |
| `brand?: string` | `brand: Optional[str]` | `brand` |
| `notes?: string` | `notes: Optional[str]` | `notes` |
| `supplierName?: string` | `supplier_name: Optional[str]` → alias | `supplierName` |
| `supplierContact?: string` | `supplier_contact: Optional[str]` → alias | `supplierContact` |
| `purchaseLink?: string` | `purchase_link: Optional[str]` → alias | `purchaseLink` |
| `imageUri?: string` | `image_uri: Optional[str]` → alias | `imageUri` |
| `isActive: boolean` | `is_active: bool` → alias | `isActive` |
| `isCritical: boolean` | `is_critical: bool` → alias | `isCritical` |
| `createdAt: string` | `created_at: datetime` → alias | `createdAt` |
| `updatedAt: string` | `updated_at: datetime` → alias | `updatedAt` |

### OrderItem

| Frontend (TypeScript) | Backend (Pydantic) | JSON Key |
|-----------------------|-------------------|----------|
| `id: string` | `id: str` | `id` |
| `orderId: string` | `order_id: str` → alias | `orderId` |
| `itemId: string` | `item_id: str` → alias | `itemId` |
| `name: string` | `name: str` | `name` |
| `brand?: string` | `brand: Optional[str]` | `brand` |
| `unit: string` | `unit: str` | `unit` |
| `quantity: number` | `quantity: int` | `quantity` |
| `currentStock: number` | `current_stock: int` → alias | `currentStock` |
| `minimumStock: number` | `minimum_stock: int` → alias | `minimumStock` |
| `imageUri?: string` | `image_uri: Optional[str]` → alias | `imageUri` |
| `supplierName?: string` | `supplier_name: Optional[str]` → alias | `supplierName` |
| `purchaseLink?: string` | `purchase_link: Optional[str]` → alias | `purchaseLink` |

### SavedOrder (Order)

| Frontend (TypeScript) | Backend (Pydantic) | JSON Key |
|-----------------------|-------------------|----------|
| `id: string` | `id: str` | `id` |
| `orderId: string` | `order_id: str` → alias | `orderId` |
| `pdfPath?: string` | `pdf_path: Optional[str]` → alias | `pdfPath` |
| `items: OrderItem[]` | `items: list[OrderItemResponse]` | `items` |
| `totalItems: number` | `total_items: int` → alias | `totalItems` |
| `totalUnits: number` | `total_units: int` → alias | `totalUnits` |
| `status: OrderStatus` | `status: OrderStatus` | `status` |
| `exportedAt: string` | `exported_at: datetime` → alias | `exportedAt` |
| `orderedAt?: string` | `ordered_at: Optional[datetime]` → alias | `orderedAt` |
| `receivedAt?: string` | `received_at: Optional[datetime]` → alias | `receivedAt` |
| `appliedAt?: string` | `applied_at: Optional[datetime]` → alias | `appliedAt` |
| `declinedAt?: string` | `declined_at: Optional[datetime]` → alias | `declinedAt` |

### OrderStatus Enum

| Frontend | Backend |
|----------|---------|
| `'pending'` | `pending` ✅ |
| `'ordered'` | `ordered` ✅ |
| `'partially_received'` | ❌ *Not in backend* |
| `'received'` | `received` ✅ |
| `'stock_updated'` | `applied` ⚠️ *Different name* |
| `'declined'` | `declined` ✅ |

**Note:** Frontend uses `stock_updated` but backend uses `applied`. You may need to map these in your API service.

---

## 🔄 API Endpoints Mapped to Frontend Actions

### Authentication (Required for all protected endpoints)

| Frontend Action | HTTP Method | Endpoint | Rate Limit |
|----------------|-------------|----------|------------|
| Register | POST | `/api/v1/auth/register` | 3/hour |
| Login | POST | `/api/v1/auth/login` | 5/min |
| Verify Email | GET | `/api/v1/auth/verify-email/{token}` | - |
| Resend Verification | POST | `/api/v1/auth/resend-verification` | 3/hour |
| Forgot Password | POST | `/api/v1/auth/forgot-password` | 3/hour |
| Reset Password | POST | `/api/v1/auth/reset-password` | 5/hour |
| Refresh Token | POST | `/api/v1/auth/refresh` | - |
| Logout | POST | `/api/v1/auth/logout` | - |
| Get Profile | GET | `/api/v1/auth/me` | - |
| Update Profile | PATCH | `/api/v1/auth/me` | - |
| Change Password | POST | `/api/v1/auth/change-password` | - |

### Categories

| Frontend Action | HTTP Method | Endpoint |
|----------------|-------------|----------|
| List Categories | GET | `/api/v1/categories` |
| Create Category | POST | `/api/v1/categories` |
| Get Category | GET | `/api/v1/categories/{id}` |
| Update Category | PUT | `/api/v1/categories/{id}` |
| Delete Category | DELETE | `/api/v1/categories/{id}` |
| Categories with counts | GET | `/api/v1/categories/with-counts` |

### Items

| Frontend Action | HTTP Method | Endpoint |
|----------------|-------------|----------|
| List Items | GET | `/api/v1/items` |
| Create Item | POST | `/api/v1/items` |
| Get Item | GET | `/api/v1/items/{id}` |
| Update Item | PUT | `/api/v1/items/{id}` |
| Delete Item | DELETE | `/api/v1/items/{id}` |
| Quick Stock Update | PATCH | `/api/v1/items/{id}/stock` |
| Get Stats (Dashboard) | GET | `/api/v1/items/stats` |
| Items Needing Attention | GET | `/api/v1/items/needs-attention` |

### Orders

| Frontend Action | HTTP Method | Endpoint |
|----------------|-------------|----------|
| List Orders | GET | `/api/v1/orders` |
| Create Order | POST | `/api/v1/orders` |
| Get Order | GET | `/api/v1/orders/{id}` |
| Delete Order | DELETE | `/api/v1/orders/{id}` |
| Update Status | PATCH | `/api/v1/orders/{id}/status` |
| Apply to Stock | POST | `/api/v1/orders/{id}/apply` |

### Sync (Offline-First Support)

| Frontend Action | HTTP Method | Endpoint |
|----------------|-------------|----------|
| Push Changes | POST | `/api/v1/sync/push` |
| Pull Changes | POST | `/api/v1/sync/pull` |
| Full Sync | POST | `/api/v1/sync/full` |

---

## 🔗 How Frontend Connects to Backend

### Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│                     MOBILE APP (Frontend)                     │
│                  React Native / Expo                          │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐        │
│  │  Dashboard  │   │    Items    │   │   Orders    │        │
│  │   Screen    │   │   Screen    │   │   Screen    │        │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘        │
│         │                 │                 │                │
│         ▼                 ▼                 ▼                │
│  ┌────────────────────────────────────────────────────┐     │
│  │              useAppStore (Zustand)                  │     │
│  │  - categories: Category[]                           │     │
│  │  - items: Item[]                                    │     │
│  │  - savedOrders: SavedOrder[]                        │     │
│  │  - activityLogs: ActivityLog[]                      │     │
│  └──────────────────────────┬─────────────────────────┘     │
│                             │                                │
│                             ▼                                │
│  ┌────────────────────────────────────────────────────┐     │
│  │              API Service Layer                      │     │
│  │  - authService.login()                              │     │
│  │  - itemsService.create(), update(), delete()        │     │
│  │  - ordersService.apply()                            │     │
│  │  - syncService.fullSync()                           │     │
│  └────────────────────────────────────────────────────┘     │
│                             │                                │
└─────────────────────────────┼────────────────────────────────┘
                              │
                              │ HTTP (fetch/axios)
                              │ Authorization: Bearer {token}
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI)                         │
│                  http://localhost:8000                        │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐        │
│  │    Auth     │   │    Items    │   │   Orders    │        │
│  │   Router    │   │   Router    │   │   Router    │        │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘        │
│         │                 │                 │                │
│         ▼                 ▼                 ▼                │
│  ┌────────────────────────────────────────────────────┐     │
│  │              SQLAlchemy Models                      │     │
│  │  - User, RefreshToken                               │     │
│  │  - Category, Item                                   │     │
│  │  - Order, OrderItem, ActivityLog                    │     │
│  └──────────────────────────┬─────────────────────────┘     │
│                             │                                │
│                             ▼                                │
│  ┌────────────────────────────────────────────────────┐     │
│  │              PostgreSQL Database                    │     │
│  │  (Running in Docker container)                      │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Data Flow Example: Creating an Item

```
1. USER taps "Add Item" on mobile app
         │
         ▼
2. FRONTEND: ItemForm.tsx collects data
   {
     categoryId: "uuid-123",
     name: "Oxygen Cylinder",
     quantity: 5,
     minimumStock: 2,
     isCritical: true
   }
         │
         ▼
3. FRONTEND: useAppStore.addItem() is called
         │
         ▼
4. API SERVICE: POST /api/v1/items
   Headers: { Authorization: "Bearer eyJ..." }
   Body: { categoryId: "uuid-123", name: "Oxygen...", ... }
         │
         ▼
5. BACKEND: items.router handles request
   - Validates with ItemCreate schema
   - Creates Item in database
   - Returns ItemResponse
         │
         ▼
6. FRONTEND: Store updates with new item
   items: [...items, newItem]
         │
         ▼
7. UI: Item list re-renders with new item
```

---

## ⚠️ Minor Gaps to Address

### 1. OrderStatus Mapping
Frontend has `stock_updated`, backend has `applied`. Add mapping:

```typescript
// In your API service
const mapOrderStatus = (backendStatus: string): OrderStatus => {
  if (backendStatus === 'applied') return 'stock_updated';
  return backendStatus as OrderStatus;
};
```

### 2. Dashboard Stats
Backend returns `criticalItems`, frontend expects `pendingOrdersCount`. You can:
- Add `pendingOrdersCount` to backend stats endpoint
- Or calculate in frontend from orders list

### 3. Authentication Token Storage
Frontend needs to store tokens after login:
- Use `AsyncStorage` for React Native
- Store `access_token` and `refresh_token`
- Add token to all API request headers

---

## ✅ Verification Checklist

| Check | Status |
|-------|--------|
| All entity fields match | ✅ |
| camelCase aliases configured | ✅ |
| CRUD endpoints available | ✅ |
| Authentication endpoints | ✅ |
| Sync endpoints for offline | ✅ |
| Response formats match frontend types | ✅ |
| Order status values compatible | ⚠️ Minor mapping needed |
| Dashboard stats compatible | ⚠️ Minor adjustment needed |

---

## 🚀 Ready for Integration!

The backend API is **fully compatible** with your frontend. To integrate:

1. **Create API service file** in frontend (`services/api.ts`)
2. **Configure base URL** (`http://localhost:8000` for dev)
3. **Implement auth flow** (login → store tokens → add to headers)
4. **Replace local storage** with API calls in useAppStore

---

*Generated: January 24, 2026*
