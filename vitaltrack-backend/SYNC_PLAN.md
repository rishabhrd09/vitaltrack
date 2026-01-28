# 🔄 VitalTrack Frontend-Backend Synchronization Plan

**Analysis Date:** January 26, 2026  
**Frontend:** `vitaltrack-mobile` (React Native/Expo)  
**Backend:** `vitaltrack-backend` (FastAPI/Python)

---

## Executive Summary

| Aspect | Frontend Status | Backend Status |
|--------|-----------------|----------------|
| **Data Models** | ✅ Complete | ✅ Complete |
| **Authentication** | ❌ Missing | ✅ Complete (12 endpoints) |
| **API Service Layer** | ❌ Missing | ✅ Complete |
| **Email Verification** | ❌ Missing | ✅ Complete |
| **Password Reset** | ❌ Missing | ✅ Complete |
| **Token Management** | ❌ Missing | ✅ Complete |
| **Offline Sync** | 🔶 Local Only | ✅ Complete (3 endpoints) |
| **CRUD Operations** | ✅ Local Only | ✅ Complete |

---

# Part 1: Current Frontend Architecture

## What Exists in Frontend

```
vitaltrack-mobile/
├── app/                          # Screens (Expo Router)
│   ├── (tabs)/
│   │   ├── index.tsx             # Dashboard
│   │   ├── inventory.tsx         # Item list
│   │   └── orders.tsx            # Order list
│   ├── item/[id].tsx             # Item detail/edit
│   ├── order/create.tsx          # Create order
│   └── builder.tsx               # Build order
├── components/                   # UI Components
├── store/
│   └── useAppStore.ts            # Zustand + AsyncStorage (LOCAL ONLY)
├── types/
│   └── index.ts                  # TypeScript types
└── utils/
    ├── helpers.ts                # UUID, dates
    └── sanitize.ts               # Input validation
```

## Current Data Flow (LOCAL ONLY)

```
┌─────────────────────────────────────────────────────────────┐
│                    CURRENT FRONTEND                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Screen (e.g., inventory.tsx)                              │
│        │                                                     │
│        ▼                                                     │
│   useAppStore (Zustand)                                     │
│        │                                                     │
│        ▼                                                     │
│   AsyncStorage (Device Only)  ◄── NO SERVER SYNC!           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## What Does NOT Exist in Frontend

| Missing Feature | Description |
|-----------------|-------------|
| **Auth Screens** | No Login, Register, Forgot Password screens |
| **API Service** | No HTTP client to communicate with backend |
| **Token Storage** | No JWT token management |
| **Auth Context** | No authentication state management |
| **Protected Routes** | No route guards for authenticated users |
| **User Profile** | No profile screen or settings |
| **Server Sync** | Store uses AsyncStorage only, not API |
| **Error Handling** | No API error handling (401, 429, etc.) |

---

# Part 2: Backend API Capabilities

## Available Endpoints

### Authentication (12 endpoints)
| Endpoint | Purpose |
|----------|---------|
| `POST /auth/register` | User registration |
| `POST /auth/login` | User login (email/username) |
| `GET /auth/verify-email/{token}` | Verify email address |
| `POST /auth/resend-verification` | Resend verification email |
| `POST /auth/forgot-password` | Request password reset |
| `POST /auth/reset-password` | Reset password with token |
| `POST /auth/refresh` | Refresh access token |
| `POST /auth/logout` | Revoke refresh token |
| `GET /auth/me` | Get current user profile |
| `PATCH /auth/me` | Update user profile |
| `POST /auth/change-password` | Change password |

### Data Operations (23 endpoints)
| Entity | Endpoints |
|--------|-----------|
| Categories | 6 CRUD endpoints |
| Items | 8 CRUD endpoints + stats |
| Orders | 6 CRUD endpoints + apply |
| Sync | 3 endpoints (push/pull/full) |

---

# Part 3: Synchronization Gap Analysis

## 3.1 Type Differences

| Type | Frontend | Backend | Action Needed |
|------|----------|---------|---------------|
| `OrderStatus` | `'stock_updated'` | `'applied'` | Map in frontend |
| `DashboardStats` | `pendingOrdersCount` | `criticalItems` | Add field to backend OR calculate in frontend |
| `User` | ❌ Missing | ✅ Complete | Add to frontend |
| `AuthResponse` | ❌ Missing | ✅ Complete | Add to frontend |
| `ActivityLog.timestamp` | `timestamp` | `created_at` | Alias properly |

## 3.2 Missing Frontend Types

```typescript
// ADD TO types/index.ts

// User & Auth Types (NEW)
export interface User {
  id: string;
  email: string | null;
  username: string | null;
  name: string;
  phone: string | null;
  isActive: boolean;
  isVerified: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface LoginRequest {
  identifier: string;  // email or username
  password: string;
}

export interface RegisterRequest {
  email?: string;
  username?: string;
  password: string;
  name: string;
  phone?: string;
}
```

---

# Part 4: Required Frontend Changes

## 4.1 New Files to Create

### API Service Layer
```
services/
├── api.ts              # Base HTTP client (fetch/axios)
├── auth.ts             # Auth endpoints
├── categories.ts       # Category endpoints
├── items.ts            # Item endpoints
├── orders.ts           # Order endpoints
└── sync.ts             # Sync endpoints
```

### Authentication Screens
```
app/
├── (auth)/
│   ├── _layout.tsx     # Auth stack layout
│   ├── login.tsx       # Login screen
│   ├── register.tsx    # Register screen
│   ├── forgot-password.tsx    # Request reset
│   └── reset-password.tsx     # Enter new password
├── verify-email.tsx    # Email verification (deep link)
└── profile.tsx         # User profile/settings
```

### State Management
```
store/
├── useAuthStore.ts     # Auth state (tokens, user)
└── useAppStore.ts      # (Update to use API)

contexts/
└── AuthContext.tsx     # Auth provider
```

## 4.2 Files to Modify

| File | Changes Needed |
|------|----------------|
| `types/index.ts` | Add User, AuthResponse, request types |
| `store/useAppStore.ts` | Replace AsyncStorage calls with API calls |
| `app/_layout.tsx` | Add auth check, protected routes |
| `app/(tabs)/_layout.tsx` | Verify authentication |
| `utils/helpers.ts` | Add token storage utilities |

---

# Part 5: Required Backend Changes

## 5.1 Minor Adjustments Needed

| Change | File | Description |
|--------|------|-------------|
| Add `pendingOrdersCount` | `items.py` stats endpoint | Frontend expects this in DashboardStats |
| Add `totalCategories` | `items.py` stats endpoint | Frontend expects this |
| Rename `criticalItems` | `items.py` | OR keep and add new field |

## 5.2 Stats Endpoint Enhancement

Current backend `/items/stats` returns:
```json
{
  "totalItems": 150,
  "outOfStockCount": 5,
  "lowStockCount": 12,
  "criticalItems": 8
}
```

Frontend expects:
```json
{
  "totalItems": 150,
  "totalCategories": 6,
  "outOfStockCount": 5,
  "lowStockCount": 12,
  "pendingOrdersCount": 3
}
```

**Action:** Update `GET /items/stats` to include `totalCategories` and `pendingOrdersCount`.

---

# Part 6: Implementation Priority

## Phase 1: Core API Integration (Critical)

| Priority | Task | Effort |
|----------|------|--------|
| 1 | Create `services/api.ts` (HTTP client) | 2 hours |
| 2 | Create `services/auth.ts` | 2 hours |
| 3 | Create `store/useAuthStore.ts` | 2 hours |
| 4 | Create Login screen | 3 hours |
| 5 | Create Register screen | 3 hours |
| 6 | Add protected routes in `_layout.tsx` | 2 hours |
| 7 | Update `useAppStore.ts` to use API | 4 hours |

**Subtotal: ~18 hours**

## Phase 2: Auth Features (High)

| Priority | Task | Effort |
|----------|------|--------|
| 1 | Create Forgot Password screen | 2 hours |
| 2 | Create Reset Password screen | 2 hours |
| 3 | Handle Email Verification (deep link) | 3 hours |
| 4 | Add token refresh logic | 2 hours |
| 5 | Add Profile/Settings screen | 3 hours |

**Subtotal: ~12 hours**

## Phase 3: Sync & Polish (Medium)

| Priority | Task | Effort |
|----------|------|--------|
| 1 | Implement offline queue | 4 hours |
| 2 | Add sync indicator UI | 2 hours |
| 3 | Handle API errors (toast) | 2 hours |
| 4 | Add loading states | 2 hours |
| 5 | Test offline → online flow | 3 hours |

**Subtotal: ~13 hours**

---

# Part 7: Detailed Implementation Specifications

## 7.1 API Client (`services/api.ts`)

```typescript
// Key features needed:
// - Base URL configuration
// - Automatic token injection (Authorization header)
// - Token refresh on 401
// - Rate limit handling (429)
// - Error normalization
```

## 7.2 Auth Store (`store/useAuthStore.ts`)

```typescript
// State:
// - user: User | null
// - accessToken: string | null
// - refreshToken: string | null
// - isAuthenticated: boolean
// - isLoading: boolean

// Actions:
// - login(identifier, password)
// - register(data)
// - logout()
// - refreshTokens()
// - updateProfile(data)
// - changePassword(current, new)
```

## 7.3 Protected Routes

```typescript
// In app/_layout.tsx:
// - Check if user is authenticated
// - If not, redirect to /login
// - If yes, render children
// - Handle token expiry
```

## 7.4 OrderStatus Mapping

```typescript
// In services/orders.ts or utils/mappers.ts:
const mapOrderStatus = (backendStatus: string): OrderStatus => {
  if (backendStatus === 'applied') return 'stock_updated';
  return backendStatus as OrderStatus;
};
```

---

# Part 8: Backend Recommended Changes

## 8.1 Update Stats Endpoint

**File:** `app/api/v1/items.py`  
**Endpoint:** `GET /items/stats`

Add to response:
```python
# Query pending orders count
pending_count_result = await db.execute(
    select(func.count())
    .select_from(Order)
    .where(
        Order.user_id == current_user.id,
        Order.status.in_(["pending", "received"])
    )
)
pending_count = pending_count_result.scalar() or 0

# Query total categories
cat_count_result = await db.execute(
    select(func.count())
    .select_from(Category)
    .where(Category.user_id == current_user.id)
)
cat_count = cat_count_result.scalar() or 0

return {
    "totalItems": total_items,
    "totalCategories": cat_count,        # NEW
    "outOfStockCount": out_of_stock,
    "lowStockCount": low_stock,
    "criticalItems": critical,
    "pendingOrdersCount": pending_count,  # NEW
}
```

---

# Summary: What Needs to Change

## Frontend Changes (Major - ~43 hours total)

| Area | Files to Create | Files to Modify |
|------|-----------------|-----------------|
| API Layer | 6 new files | - |
| Auth Screens | 5 new screens | - |
| Stores | 1 new store | 1 existing store |
| Types | - | 1 file (add types) |
| Navigation | - | 2 layout files |
| Utils | 1 new file | 1 existing file |

## Backend Changes (Minor - ~2 hours total)

| Area | Change |
|------|--------|
| Stats endpoint | Add `totalCategories`, `pendingOrdersCount` |
| Schema | Update `ItemStats` response model |

---

# Appendix: File-by-File Change List

## Frontend: New Files

1. `services/api.ts` - HTTP client with auth
2. `services/auth.ts` - Auth API calls
3. `services/categories.ts` - Category API calls
4. `services/items.ts` - Item API calls
5. `services/orders.ts` - Order API calls
6. `services/sync.ts` - Sync API calls
7. `store/useAuthStore.ts` - Auth state
8. `contexts/AuthContext.tsx` - Auth provider
9. `app/(auth)/_layout.tsx` - Auth stack
10. `app/(auth)/login.tsx` - Login screen
11. `app/(auth)/register.tsx` - Register screen
12. `app/(auth)/forgot-password.tsx` - Forgot password
13. `app/(auth)/reset-password.tsx` - Reset password
14. `app/profile.tsx` - User profile
15. `utils/tokens.ts` - Token storage

## Frontend: Modified Files

1. `types/index.ts` - Add User, Auth types
2. `store/useAppStore.ts` - Use API instead of local
3. `app/_layout.tsx` - Add auth guard
4. `app/(tabs)/_layout.tsx` - Verify auth
5. `utils/helpers.ts` - Add token helpers

## Backend: Modified Files

1. `app/api/v1/items.py` - Update stats endpoint
2. `app/schemas/item.py` - Update ItemStats schema

---

*This document provides the complete synchronization plan. No implementation has been performed.*
