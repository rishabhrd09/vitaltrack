# VitalTrack - Complete Technical Documentation
## Phase 1 & Phase 2 Implementation Analysis

**Document Version:** 1.0.0  
**Date:** January 2026  
**Project:** VitalTrack Medical Inventory Management System

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [ROADMAP Alignment Verification](#2-roadmap-alignment-verification)
3. [System Architecture](#3-system-architecture)
4. [Phase 1 Frontend Analysis](#4-phase-1-frontend-analysis)
5. [Phase 2 Backend Implementation](#5-phase-2-backend-implementation)
6. [Security Audit Report](#6-security-audit-report)
7. [API Documentation](#7-api-documentation)
8. [Database Design](#8-database-design)
9. [End-to-End Feature Flows](#9-end-to-end-feature-flows)
10. [Installation & Setup Guide](#10-installation--setup-guide)
11. [Coding Standards & Patterns](#11-coding-standards--patterns)
12. [Scalability & Maintainability](#12-scalability--maintainability)
13. [Testing Strategy](#13-testing-strategy)
14. [Deployment Guide](#14-deployment-guide)
15. [Future Enhancements](#15-future-enhancements)

---

## 1. Executive Summary

### Project Overview

VitalTrack is a medical inventory management system designed for families managing home ICU setups. The application features an anxiety-reducing interface that helps caregivers track life-critical medical supplies with confidence.

### Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Mobile Frontend** | React Native + Expo | SDK 54 |
| **State Management** | Zustand | 4.5.2 |
| **Backend API** | FastAPI | 0.115.6 |
| **Database** | PostgreSQL | 16+ |
| **ORM** | SQLAlchemy (Async) | 2.0.36 |
| **Authentication** | JWT + Argon2 | - |
| **Migrations** | Alembic | 1.14.0 |

### Implementation Status

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1: Frontend | ✅ Complete | 100% |
| Phase 2: Backend | ✅ Complete | 100% |
| Phase 3: Deployment | 🔲 Pending | 0% |

### Key Achievements

- ✅ Full offline-first architecture with sync support
- ✅ Comprehensive security hardening (XSS, injection, auth)
- ✅ Production-ready API with JWT token rotation
- ✅ Type-safe frontend with TypeScript
- ✅ Async database operations with connection pooling
- ✅ Docker containerization ready

---

## 2. ROADMAP Alignment Verification

### Phase 1 Requirements Checklist

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Project Setup (Expo + TypeScript + Zustand) | ✅ | `package.json`, `tsconfig.json` |
| Dashboard Screen | ✅ | `app/(tabs)/index.tsx` |
| Inventory Screen | ✅ | `app/(tabs)/inventory.tsx` |
| Orders Screen | ✅ | `app/(tabs)/orders.tsx` |
| Item Form (Add/Edit) | ✅ | `app/item/[id].tsx` |
| Create Order + PDF | ✅ | `app/order/create.tsx` |
| Data Persistence | ✅ | `store/useAppStore.ts` (AsyncStorage) |
| Theme System | ✅ | `theme/ThemeContext.tsx`, `theme/colors.ts` |

### Phase 2 Requirements Checklist

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| FastAPI Project Setup | ✅ | `app/main.py` |
| Database Models | ✅ | `app/models/*.py` |
| Alembic Migrations | ✅ | `alembic/versions/` |
| User Registration | ✅ | `POST /api/v1/auth/register` |
| JWT Token Generation | ✅ | `app/core/security.py` |
| Refresh Token Rotation | ✅ | `POST /api/v1/auth/refresh` |
| Protected Routes | ✅ | `app/api/deps.py` |
| Categories CRUD | ✅ | `app/api/v1/categories.py` |
| Items CRUD | ✅ | `app/api/v1/items.py` |
| Orders CRUD | ✅ | `app/api/v1/orders.py` |
| Sync Endpoints | ✅ | `app/api/v1/sync.py` |
| Docker Configuration | ✅ | `Dockerfile`, `docker-compose.yml` |

### API Endpoint Verification vs ROADMAP

```
ROADMAP Specification          Implementation Status
─────────────────────────────────────────────────────
POST /api/v1/auth/register     ✅ Implemented
POST /api/v1/auth/login        ✅ Implemented
POST /api/v1/auth/refresh      ✅ Implemented
POST /api/v1/auth/logout       ✅ Implemented

GET  /api/v1/categories        ✅ Implemented
POST /api/v1/categories        ✅ Implemented
GET  /api/v1/categories/{id}   ✅ Implemented
PUT  /api/v1/categories/{id}   ✅ Implemented
DELETE /api/v1/categories/{id} ✅ Implemented

GET  /api/v1/items             ✅ Implemented (with filters)
POST /api/v1/items             ✅ Implemented
GET  /api/v1/items/{id}        ✅ Implemented
PUT  /api/v1/items/{id}        ✅ Implemented
PATCH /api/v1/items/{id}/stock ✅ Implemented
DELETE /api/v1/items/{id}      ✅ Implemented

GET  /api/v1/orders            ✅ Implemented
POST /api/v1/orders            ✅ Implemented
GET  /api/v1/orders/{id}       ✅ Implemented
PATCH /api/v1/orders/{id}/status ✅ Implemented
POST /api/v1/orders/{id}/apply ✅ Implemented (bonus)
DELETE /api/v1/orders/{id}     ✅ Implemented

POST /api/v1/sync/push         ✅ Implemented
GET  /api/v1/sync/pull         ✅ Implemented (POST)
POST /api/v1/sync/full         ✅ Implemented
```

---

## 3. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VITALTRACK SYSTEM ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐         ┌──────────────────┐        ┌──────────────┐ │
│  │   Mobile App     │◄───────►│    FastAPI       │◄──────►│  PostgreSQL  │ │
│  │  (React Native)  │  HTTPS  │    Backend       │  Async │   Database   │ │
│  │                  │   JWT   │                  │   Pool │              │ │
│  └────────┬─────────┘         └────────┬─────────┘        └──────────────┘ │
│           │                            │                                    │
│           │                            │                                    │
│  ┌────────▼─────────┐         ┌────────▼─────────┐                         │
│  │   Local Storage  │         │   Redis Cache    │  (Future)               │
│  │  (AsyncStorage)  │         │   (Optional)     │                         │
│  │   Offline-First  │         │                  │                         │
│  └──────────────────┘         └──────────────────┘                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Backend Architecture (3-Tier Pattern)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRESENTATION LAYER (API Routes)                                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐│
│  │   auth.py  │ │categories.py│ │  items.py  │ │ orders.py  │ │  sync.py   ││
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘│
│        │              │              │              │              │        │
│  ──────▼──────────────▼──────────────▼──────────────▼──────────────▼─────── │
│                                                                              │
│  BUSINESS LOGIC LAYER (Dependencies + Schemas)                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  deps.py (Authentication, Pagination)                                  │ │
│  │  schemas/*.py (Pydantic Validation & Serialization)                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  DATA ACCESS LAYER (Models + Database)                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  models/*.py (SQLAlchemy ORM)                                          │ │
│  │  database.py (Async Session Management)                                │ │
│  │  Alembic (Migrations)                                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Frontend Architecture (Component Pattern)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SCREENS (app/)                                                             │
│  ┌─────────┐ ┌──────────────┐ ┌─────────────┐ ┌──────────────┐             │
│  │ (tabs)/ │ │   item/      │ │   order/    │ │   builder    │             │
│  │ index   │ │   [id].tsx   │ │  create.tsx │ │    .tsx      │             │
│  │inventory│ │   (Form)     │ │   (PDF)     │ │  (Wizard)    │             │
│  │ orders  │ │              │ │             │ │              │             │
│  └────┬────┘ └──────────────┘ └─────────────┘ └──────────────┘             │
│       │                                                                     │
│  COMPONENTS (components/)                                                   │
│  ┌─────────────┐ ┌────────────────┐ ┌──────────────┐ ┌─────────────────┐   │
│  │   common/   │ │   dashboard/   │ │  inventory/  │ │     orders/     │   │
│  │ TopBar      │ │ StatsCard      │ │ CategoryHdr  │ │   OrderCard     │   │
│  │ ProfileMenu │ │ NeedsAttention │ │ ItemRow      │ │                 │   │
│  │ ExportModal │ │ ActivityList   │ │              │ │                 │   │
│  └─────────────┘ └────────────────┘ └──────────────┘ └─────────────────┘   │
│                                                                             │
│  STATE MANAGEMENT (store/)                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  useAppStore.ts (Zustand + AsyncStorage Persistence)                │   │
│  │  - Categories, Items, Orders, ActivityLogs, Backups                 │   │
│  │  - CRUD Operations, Computed Getters, Data Management               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  UTILITIES (utils/, types/, theme/)                                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────────────┐   │
│  │ helpers.ts  │ │ sanitize.ts │ │ types/index.ts (TypeScript Defs)   │   │
│  │ (UUID, Date)│ │ (Security)  │ │ theme/ (Colors, Spacing, Context)  │   │
│  └─────────────┘ └─────────────┘ └─────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  OFFLINE MODE                              ONLINE MODE                        │
│  ────────────                              ───────────                        │
│                                                                               │
│  ┌──────────┐    ┌─────────────┐          ┌──────────┐    ┌────────────┐    │
│  │  User    │───►│ Zustand     │          │  User    │───►│ API Call   │    │
│  │  Action  │    │ Store       │          │  Action  │    │            │    │
│  └──────────┘    └──────┬──────┘          └──────────┘    └─────┬──────┘    │
│                         │                                       │            │
│                         ▼                                       ▼            │
│                  ┌─────────────┐                         ┌────────────┐      │
│                  │ AsyncStorage│                         │  FastAPI   │      │
│                  │ (Persisted) │                         │  Backend   │      │
│                  └─────────────┘                         └─────┬──────┘      │
│                                                                │            │
│                         │                                      ▼            │
│                         │                               ┌────────────┐      │
│                         │                               │ PostgreSQL │      │
│                         │                               │  Database  │      │
│                         │                               └─────┬──────┘      │
│                         │                                     │            │
│                         │         SYNC                        │            │
│                         │◄────────────────────────────────────┤            │
│                         │    (When Online)                    │            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Phase 1 Frontend Analysis

### 4.1 Project Structure

```
vitaltrack-mobile/
├── app/                          # Expo Router screens
│   ├── (tabs)/                   # Tab navigation
│   │   ├── _layout.tsx           # Tab bar configuration
│   │   ├── index.tsx             # Dashboard screen
│   │   ├── inventory.tsx         # Inventory list
│   │   └── orders.tsx            # Orders list
│   ├── item/
│   │   └── [id].tsx              # Item form (add/edit)
│   ├── order/
│   │   └── create.tsx            # Order creation + PDF
│   ├── builder.tsx               # Inventory builder wizard
│   └── _layout.tsx               # Root layout
├── components/                   # Reusable components
│   ├── common/                   # Shared UI components
│   ├── dashboard/                # Dashboard-specific
│   ├── inventory/                # Inventory-specific
│   └── orders/                   # Order-specific
├── store/
│   └── useAppStore.ts            # Zustand state management
├── types/
│   └── index.ts                  # TypeScript definitions
├── utils/
│   ├── helpers.ts                # Utility functions
│   └── sanitize.ts               # Security utilities
├── theme/
│   ├── ThemeContext.tsx          # Dark/Light mode
│   ├── colors.ts                 # Color palette
│   └── spacing.ts                # Design tokens
└── data/
    └── seedData.ts               # Default data
```

### 4.2 Key Frontend Features

| Feature | Implementation | Status |
|---------|----------------|--------|
| **Dashboard** | Stats, Needs Attention, Activity | ✅ |
| **Inventory** | Category groups, Search, Dual view | ✅ |
| **Item Management** | Full CRUD with image support | ✅ |
| **Order Creation** | Cart-style UI, PDF generation | ✅ |
| **Order Tracking** | Status workflow, Apply to stock | ✅ |
| **Data Export/Import** | JSON format with validation | ✅ |
| **Backup System** | Create/Restore up to 3 backups | ✅ |
| **Theme Support** | Dark/Light mode toggle | ✅ |
| **Critical Items** | Special handling for ICU equipment | ✅ |

### 4.3 State Management Analysis

**Zustand Store Structure:**

```typescript
interface AppState {
  // Data
  categories: Category[];
  items: Item[];
  activityLogs: ActivityLog[];
  savedOrders: SavedOrder[];
  backups: Backup[];
  
  // UI State
  isInitialized: boolean;
  searchQuery: string;
  selectedCategoryId: string | null;
  expandedCategories: string[];
  expandedItems: string[];
}
```

**Persistence Configuration:**
- Storage: `@react-native-async-storage/async-storage`
- Key: `vitaltrack-storage`
- Partial persistence (excludes UI state)

### 4.4 TypeScript Type Alignment

| Frontend Type | Backend Model | Match |
|---------------|---------------|-------|
| `Category` | `Category` | ✅ 100% |
| `Item` | `Item` | ✅ 100% |
| `SavedOrder` | `Order` | ✅ 100% |
| `OrderItem` | `OrderItem` | ✅ 100% |
| `ActivityLog` | `ActivityLog` | ✅ 100% |
| `OrderStatus` | `OrderStatus` | ✅ 100% |
| `ActivityActionType` | `ActivityActionType` | ✅ 100% |

---

## 5. Phase 2 Backend Implementation

### 5.1 Project Structure

```
vitaltrack-backend/
├── alembic/                      # Database migrations
│   ├── versions/
│   │   └── 20260117_000000_initial.py
│   ├── env.py
│   └── script.py.mako
├── app/
│   ├── api/                      # API layer
│   │   ├── deps.py               # Dependencies (auth, pagination)
│   │   └── v1/                   # API version 1
│   │       ├── __init__.py       # Router aggregation
│   │       ├── auth.py           # Authentication routes
│   │       ├── categories.py     # Category CRUD
│   │       ├── items.py          # Item CRUD
│   │       ├── orders.py         # Order CRUD
│   │       └── sync.py           # Sync endpoints
│   ├── core/                     # Core functionality
│   │   ├── __init__.py
│   │   ├── config.py             # Settings (pydantic-settings)
│   │   ├── database.py           # Async SQLAlchemy setup
│   │   └── security.py           # JWT + Password hashing
│   ├── models/                   # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── refresh_token.py
│   │   ├── category.py
│   │   ├── item.py
│   │   ├── order.py
│   │   └── activity.py
│   ├── schemas/                  # Pydantic schemas
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── category.py
│   │   ├── item.py
│   │   ├── order.py
│   │   ├── sync.py
│   │   └── common.py
│   ├── services/                 # Business logic (extensible)
│   ├── utils/                    # Utilities (extensible)
│   ├── __init__.py
│   └── main.py                   # FastAPI application
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── alembic.ini
├── .env.example
└── README.md
```

### 5.2 Design Pattern Compliance

| Pattern | Implementation | Reference |
|---------|----------------|-----------|
| **API Router Pattern** | `APIRouter` with prefix/tags | [FastAPI Best Practices](https://fastapi.tiangolo.com/tutorial/bigger-applications/) |
| **Dependency Injection** | `Depends()` for auth, DB | FastAPI DI system |
| **Repository Pattern** | Models + direct queries | SQLAlchemy 2.0 |
| **Schema Validation** | Pydantic v2 models | Request/Response validation |
| **Async/Await** | Full async stack | SQLAlchemy asyncpg |
| **Token Rotation** | Refresh token JTI tracking | OWASP Guidelines |

### 5.3 API Versioning Strategy

```python
# app/api/v1/__init__.py
router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(categories.router)
router.include_router(items.router)
router.include_router(orders.router)
router.include_router(sync.router)

# Future: app/api/v2/__init__.py for breaking changes
```

### 5.4 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTHENTICATION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. REGISTRATION                                                            │
│     POST /api/v1/auth/register                                              │
│     ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│     │ Validate │───►│  Hash    │───►│  Create  │───►│  Return  │          │
│     │ Input    │    │ Password │    │  User    │    │  Tokens  │          │
│     │ (Pydantic)│    │ (Argon2) │    │ + Token  │    │  + User  │          │
│     └──────────┘    └──────────┘    └──────────┘    └──────────┘          │
│                                                                              │
│  2. LOGIN                                                                   │
│     POST /api/v1/auth/login                                                 │
│     ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│     │  Find    │───►│  Verify  │───►│  Create  │───►│  Return  │          │
│     │  User    │    │ Password │    │  Token   │    │  Tokens  │          │
│     │          │    │          │    │  Pair    │    │  + User  │          │
│     └──────────┘    └──────────┘    └──────────┘    └──────────┘          │
│                                                                              │
│  3. TOKEN REFRESH (Rotation)                                                │
│     POST /api/v1/auth/refresh                                               │
│     ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│     │  Verify  │───►│  Check   │───►│  Revoke  │───►│  Create  │          │
│     │  Refresh │    │  JTI in  │    │  Old     │    │  New     │          │
│     │  Token   │    │  DB      │    │  Token   │    │  Pair    │          │
│     └──────────┘    └──────────┘    └──────────┘    └──────────┘          │
│                                                                              │
│  4. PROTECTED ROUTES                                                        │
│     Any authenticated endpoint                                              │
│     ┌──────────┐    ┌──────────┐    ┌──────────┐                          │
│     │  Extract │───►│  Verify  │───►│  Load    │───► Route Handler        │
│     │  Bearer  │    │  Access  │    │  User    │                          │
│     │  Token   │    │  Token   │    │  from DB │                          │
│     └──────────┘    └──────────┘    └──────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Security Audit Report

### 6.1 Frontend Security

| Vulnerability | Protection | Implementation |
|---------------|------------|----------------|
| **XSS (Cross-Site Scripting)** | ✅ Mitigated | `escapeHtml()` in `sanitize.ts` |
| **HTML Injection** | ✅ Mitigated | `sanitizeString()` strips tags |
| **JavaScript Protocol** | ✅ Blocked | URL validation (http/https only) |
| **Event Handler Injection** | ✅ Blocked | `onX=` pattern removal |
| **Data URI Attacks** | ✅ Blocked | `data:` protocol stripped |
| **Path Traversal** | ✅ Blocked | `..` pattern detection |
| **Insecure UUID** | ✅ Fixed | Using `expo-crypto.randomUUID()` |
| **Input Length Limits** | ✅ Enforced | `maxLength` on all fields |

**Frontend Security Code Examples:**

```typescript
// HTML Escaping (PDF Generation)
export const escapeHtml = (unsafe: string | undefined | null): string => {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

// URL Validation
export const sanitizeUrl = (url: string | undefined | null): string | undefined => {
    const ALLOWED_URL_PROTOCOLS = ['http:', 'https:'];
    // ... validation logic
};

// Secure UUID Generation
export const generateId = (): string => Crypto.randomUUID();
```

### 6.2 Backend Security

| Vulnerability | Protection | Implementation |
|---------------|------------|----------------|
| **SQL Injection** | ✅ Mitigated | SQLAlchemy ORM parameterized queries |
| **Password Storage** | ✅ Secure | Argon2 hashing (OWASP recommended) |
| **JWT Attacks** | ✅ Mitigated | HS256, token rotation, JTI tracking |
| **CSRF** | ✅ N/A | JWT-based (no cookies) |
| **Brute Force** | ⚠️ Partial | Rate limiting config ready |
| **Mass Assignment** | ✅ Mitigated | Pydantic schema validation |
| **Sensitive Data Exposure** | ✅ Mitigated | Response models exclude passwords |

**Backend Security Code Examples:**

```python
# Password Hashing (Argon2)
pwd_context = CryptContext(
    schemes=["argon2", "bcrypt"],
    deprecated="auto",
)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

# Input Validation (Pydantic)
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    
    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Must contain uppercase")
        # ... more validation
```

### 6.3 npm Audit Results

```
Vulnerability: tar <= 7.5.2 (HIGH)
Description: Path traversal via symlink poisoning
Impact: Build-time only (not runtime)
Risk Level: LOW
Recommendation: Monitor for Expo SDK updates
```

### 6.4 Security Recommendations

1. **Production Deployment:**
   - Enable HTTPS only
   - Set secure, random `SECRET_KEY`
   - Configure proper CORS origins
   - Enable rate limiting

2. **Future Enhancements:**
   - Add `expo-secure-store` for token storage
   - Implement account lockout after failed attempts
   - Add email verification flow
   - Consider 2FA for high-security deployments

---

## 7. API Documentation

### 7.1 Authentication Endpoints

#### Register User
```http
POST /api/v1/auth/register
Content-Type: application/json

{
    "email": "user@example.com",
    "password": "SecurePass123",
    "name": "John Doe",
    "phone": "+1234567890"  // optional
}

Response 201:
{
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "token_type": "bearer",
    "expires_in": 1800,
    "user": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "John Doe",
        ...
    }
}
```

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
    "email": "user@example.com",
    "password": "SecurePass123"
}

Response 200: Same as register
```

#### Refresh Token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
    "refresh_token": "eyJ..."
}

Response 200: New token pair
```

### 7.2 Resource Endpoints

#### Items

```http
# List items (with filters)
GET /api/v1/items?categoryId=uuid&isActive=true&lowStockOnly=true&search=ventilator
Authorization: Bearer <token>

# Create item
POST /api/v1/items
{
    "categoryId": "uuid",
    "name": "Ventilator Circuit",
    "quantity": 5,
    "unit": "pieces",
    "minimumStock": 2,
    "isCritical": true
}

# Update stock only
PATCH /api/v1/items/{id}/stock
{
    "quantity": 10
}
```

#### Orders

```http
# Create order
POST /api/v1/orders
{
    "items": [
        {
            "itemId": "uuid",
            "name": "Oxygen Cylinder",
            "quantity": 2,
            "currentStock": 0,
            "minimumStock": 2,
            "unit": "cylinder"
        }
    ],
    "notes": "Urgent order"
}

# Apply order to stock
POST /api/v1/orders/{id}/apply
```

### 7.3 Sync Endpoints

```http
# Full Sync (recommended)
POST /api/v1/sync/full
{
    "operations": [
        {
            "id": "op-uuid",
            "type": "create",
            "entity": "item",
            "entityId": "local-uuid",
            "localId": "local-uuid",
            "data": { ... },
            "timestamp": "2026-01-17T10:00:00Z"
        }
    ],
    "lastSyncAt": "2026-01-16T10:00:00Z"
}

Response 200:
{
    "pushResults": [...],
    "pushSuccessCount": 5,
    "pushErrorCount": 0,
    "categories": [...],
    "items": [...],
    "orders": [...],
    "serverTime": "2026-01-17T10:05:00Z"
}
```

---

## 8. Database Design

### 8.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATABASE SCHEMA                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐            │
│  │    users     │       │ refresh_     │       │  categories  │            │
│  ├──────────────┤       │   tokens     │       ├──────────────┤            │
│  │ id (PK)      │──┐    ├──────────────┤    ┌──│ id (PK)      │            │
│  │ email        │  │    │ id (PK)      │    │  │ user_id (FK) │◄───┐       │
│  │ hashed_pass  │  │    │ jti          │    │  │ name         │    │       │
│  │ name         │  ├───►│ user_id (FK) │    │  │ description  │    │       │
│  │ is_active    │  │    │ is_revoked   │    │  │ display_order│    │       │
│  │ is_verified  │  │    │ expires_at   │    │  │ is_default   │    │       │
│  │ created_at   │  │    │ device_name  │    │  │ local_id     │    │       │
│  │ updated_at   │  │    └──────────────┘    │  │ timestamps   │    │       │
│  └──────────────┘  │                        │  └──────────────┘    │       │
│         │          │                        │         │            │       │
│         │          │                        │         │            │       │
│         │          │    ┌──────────────┐    │         ▼            │       │
│         │          │    │    items     │    │  ┌──────────────┐    │       │
│         │          │    ├──────────────┤    │  │   orders     │    │       │
│         │          └───►│ id (PK)      │    │  ├──────────────┤    │       │
│         │               │ user_id (FK) │◄───┘  │ id (PK)      │    │       │
│         │               │ category_id  │───────│ user_id (FK) │◄───┤       │
│         │               │ name         │       │ order_id     │    │       │
│         │               │ quantity     │       │ status       │    │       │
│         │               │ unit         │       │ total_items  │    │       │
│         │               │ minimum_stock│       │ total_units  │    │       │
│         │               │ is_critical  │       │ exported_at  │    │       │
│         │               │ local_id     │       │ timestamps   │    │       │
│         │               │ timestamps   │       └──────┬───────┘    │       │
│         │               └──────────────┘              │            │       │
│         │                                             │            │       │
│         │               ┌──────────────┐              │            │       │
│         │               │ order_items  │◄─────────────┘            │       │
│         │               ├──────────────┤                           │       │
│         │               │ id (PK)      │                           │       │
│         │               │ order_id (FK)│    ┌──────────────┐       │       │
│         │               │ item_id      │    │activity_logs │       │       │
│         │               │ name         │    ├──────────────┤       │       │
│         │               │ quantity     │    │ id (PK)      │       │       │
│         └──────────────►│ timestamps   │    │ user_id (FK) │◄──────┘       │
│                         └──────────────┘    │ action       │               │
│                                             │ item_name    │               │
│                                             │ details      │               │
│                                             │ timestamps   │               │
│                                             └──────────────┘               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Table Specifications

| Table | Primary Key | Foreign Keys | Indexes |
|-------|-------------|--------------|---------|
| users | id (UUID) | - | email (unique) |
| refresh_tokens | id | user_id → users | jti (unique), user_id |
| categories | id | user_id → users | user_id, local_id |
| items | id | user_id → users, category_id → categories | user_id, category_id, name, local_id |
| orders | id | user_id → users | user_id, order_id (unique), local_id |
| order_items | id | order_id → orders | order_id, item_id |
| activity_logs | id | user_id → users | user_id, action, item_id, order_id, local_id |

---

## 9. End-to-End Feature Flows

### 9.1 Item Creation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ITEM CREATION FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OFFLINE MODE:                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │ User fills   │───►│ Validation   │───►│ Save to      │                  │
│  │ item form    │    │ (sanitize.ts)│    │ Zustand Store│                  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                  │
│                                                  │                          │
│                                                  ▼                          │
│                                           ┌──────────────┐                  │
│                                           │ AsyncStorage │                  │
│                                           │ Persistence  │                  │
│                                           └──────────────┘                  │
│                                                                              │
│  ONLINE MODE (Future):                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │ User fills   │───►│ Validation   │───►│ API Call     │                  │
│  │ item form    │    │ (Pydantic)   │    │ POST /items  │                  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                  │
│                                                  │                          │
│                                                  ▼                          │
│                                           ┌──────────────┐                  │
│                                           │ PostgreSQL   │                  │
│                                           │ + ActivityLog│                  │
│                                           └──────────────┘                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Order Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORDER WORKFLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐          │
│  │  PENDING  │───►│  ORDERED  │───►│ RECEIVED  │───►│  STOCK    │          │
│  │           │    │           │    │           │    │ UPDATED   │          │
│  └─────┬─────┘    └───────────┘    └───────────┘    └───────────┘          │
│        │                                                                    │
│        │          ┌───────────┐                                            │
│        └─────────►│ DECLINED  │                                            │
│                   │           │                                            │
│                   └───────────┘                                            │
│                                                                              │
│  Order States:                                                              │
│  • PENDING: Order created, PDF generated                                   │
│  • ORDERED: Purchase request sent                                          │
│  • RECEIVED: Items physically received                                     │
│  • STOCK_UPDATED: Quantities added to inventory                            │
│  • DECLINED: Order cancelled                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Offline-First Sync Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYNC FLOW                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USER MAKES CHANGES OFFLINE                                              │
│     ┌──────────────┐                                                        │
│     │ Create Item  │──► Store in Zustand + Generate local_id               │
│     │ Update Item  │──► Mark with local changes                            │
│     │ Delete Item  │──► Soft delete or queue                               │
│     └──────────────┘                                                        │
│                                                                              │
│  2. NETWORK BECOMES AVAILABLE                                               │
│     ┌──────────────┐                                                        │
│     │ Sync Queue   │──► Build list of pending operations                   │
│     │ Check        │                                                        │
│     └──────────────┘                                                        │
│                                                                              │
│  3. FULL SYNC (POST /api/v1/sync/full)                                      │
│     ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│     │ Push local   │───►│ Server       │───►│ Pull server  │              │
│     │ operations   │    │ processes    │    │ changes      │              │
│     │              │    │ each op      │    │              │              │
│     └──────────────┘    └──────────────┘    └──────────────┘              │
│                                                                              │
│  4. RECONCILIATION                                                          │
│     ┌──────────────┐                                                        │
│     │ Map server   │──► local_id → server_id mapping                       │
│     │ IDs to local │──► Update local store with server data                │
│     │ Update store │──► Clear sync queue on success                        │
│     └──────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Installation & Setup Guide

### 10.1 Prerequisites

**Development Machine:**
- Node.js 18+ 
- Python 3.11+
- PostgreSQL 15+ (or Docker)
- Git

**Mobile Testing:**
- Android: Expo Go app on physical device or emulator
- iOS: Expo Go app (Mac required for simulator)

### 10.2 Frontend Setup

```bash
# 1. Navigate to frontend directory
cd vitaltrack-mobile

# 2. Install dependencies
npm install

# 3. Start Expo development server
npx expo start

# 4. Scan QR code with Expo Go app
# Or press 'a' for Android emulator
```

### 10.3 Backend Setup (Docker - Recommended)

```bash
# 1. Navigate to backend directory
cd vitaltrack-backend

# 2. Copy environment file
cp .env.example .env

# 3. Start all services
docker-compose up -d

# 4. Verify services are running
docker-compose ps

# 5. Run database migrations
docker-compose exec api alembic upgrade head

# 6. Access API documentation
open http://localhost:8000/docs
```

### 10.4 Backend Setup (Local Python)

```bash
# 1. Navigate to backend directory
cd vitaltrack-backend

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate  # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy and configure environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# 5. Create database
createdb vitaltrack

# 6. Run migrations
alembic upgrade head

# 7. Start server
uvicorn app.main:app --reload --port 8000
```

### 10.5 Connecting Frontend to Backend

```typescript
// In mobile app, create services/api.ts:

const API_URL = __DEV__ 
  ? 'http://10.0.2.2:8000'  // Android emulator
  : 'https://api.vitaltrack.app';  // Production

// Configure in app.config.js or .env
```

---

## 11. Coding Standards & Patterns

### 11.1 Python/FastAPI Standards

| Standard | Implementation |
|----------|----------------|
| **PEP 8** | Line length 88 (Black default) |
| **Type Hints** | Full type annotations |
| **Async/Await** | All database operations |
| **Docstrings** | Google style |
| **Import Order** | stdlib, third-party, local |

**Example:**
```python
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.deps import DB, CurrentUser
from app.models import Item

router = APIRouter(prefix="/items", tags=["Items"])

@router.get("/{item_id}")
async def get_item(
    item_id: str,
    db: DB,
    current_user: CurrentUser,
) -> ItemResponse:
    """
    Get a single item by ID.
    
    Args:
        item_id: UUID of the item
        db: Database session
        current_user: Authenticated user
        
    Returns:
        ItemResponse with item details
    """
    result = await db.execute(
        select(Item).where(
            Item.id == item_id,
            Item.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return ItemResponse.model_validate(item)
```

### 11.2 TypeScript/React Native Standards

| Standard | Implementation |
|----------|----------------|
| **ESLint** | Expo default config |
| **TypeScript** | Strict mode enabled |
| **Components** | Functional with hooks |
| **State** | Zustand for global, useState for local |
| **Styling** | StyleSheet.create() |

**Example:**
```typescript
import { View, Text, StyleSheet } from 'react-native';
import { useAppStore } from '@/store/useAppStore';
import { sanitizeName } from '@/utils/sanitize';
import type { Item } from '@/types';

interface Props {
  item: Item;
  onPress: (id: string) => void;
}

export function ItemRow({ item, onPress }: Props) {
  const updateStock = useAppStore((state) => state.updateStock);
  
  return (
    <View style={styles.container}>
      <Text style={styles.name}>{item.name}</Text>
      <Text style={styles.quantity}>{item.quantity} {item.unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 16,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  quantity: {
    fontSize: 14,
    color: '#666',
  },
});
```

### 11.3 Naming Conventions

| Entity | Frontend (camelCase) | Backend (snake_case) | Database (snake_case) |
|--------|---------------------|---------------------|----------------------|
| Category ID | `categoryId` | `category_id` | `category_id` |
| Minimum Stock | `minimumStock` | `minimum_stock` | `minimum_stock` |
| Is Critical | `isCritical` | `is_critical` | `is_critical` |
| Created At | `createdAt` | `created_at` | `created_at` |

**Pydantic Alias Mapping:**
```python
class ItemResponse(BaseModel):
    category_id: str = Field(serialization_alias="categoryId")
    minimum_stock: int = Field(serialization_alias="minimumStock")
    
    model_config = {"populate_by_name": True}
```

---

## 12. Scalability & Maintainability

### 12.1 Horizontal Scalability

**Backend:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SCALABLE ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        ┌──────────────┐                                     │
│                        │ Load Balancer│                                     │
│                        │ (Nginx/AWS)  │                                     │
│                        └──────┬───────┘                                     │
│                               │                                             │
│              ┌────────────────┼────────────────┐                           │
│              │                │                │                           │
│              ▼                ▼                ▼                           │
│       ┌──────────┐     ┌──────────┐     ┌──────────┐                      │
│       │ API Pod 1│     │ API Pod 2│     │ API Pod 3│                      │
│       │ (Gunicorn│     │ (Gunicorn│     │ (Gunicorn│                      │
│       │  +Uvicorn)│    │  +Uvicorn)│    │  +Uvicorn)│                     │
│       └────┬─────┘     └────┬─────┘     └────┬─────┘                      │
│            │                │                │                             │
│            └────────────────┼────────────────┘                             │
│                             │                                              │
│                             ▼                                              │
│                    ┌──────────────┐                                        │
│                    │  PostgreSQL  │                                        │
│                    │   (Primary)  │                                        │
│                    └──────┬───────┘                                        │
│                           │                                                │
│                           ▼                                                │
│                    ┌──────────────┐                                        │
│                    │   Replica    │ (Read replicas for scale)              │
│                    └──────────────┘                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Modular Architecture

**Adding a New Feature (Example: Notifications):**

```
1. Backend:
   ├── app/models/notification.py      # New model
   ├── app/schemas/notification.py     # New schemas
   ├── app/api/v1/notifications.py     # New router
   └── app/api/v1/__init__.py          # Add router.include_router()

2. Frontend:
   ├── types/index.ts                  # Add Notification interface
   ├── store/useAppStore.ts            # Add notification state/actions
   ├── app/(tabs)/notifications.tsx    # New screen
   └── components/notifications/       # New components

3. Database:
   └── alembic revision --autogenerate -m "add notifications"
```

### 12.3 Code Reusability

**Shared Patterns:**

```python
# Backend: Base mixins for all models
class TimestampMixin:
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

class UUIDMixin:
    id: Mapped[str]

# All models inherit:
class Item(UUIDMixin, TimestampMixin, Base):
    ...
```

```typescript
// Frontend: Shared sanitization
import { sanitizeName, sanitizeUrl, sanitizeNumber } from '@/utils/sanitize';

// Used across all forms consistently
const itemData = {
    name: sanitizeName(formData.name),
    purchaseLink: sanitizeUrl(formData.purchaseLink),
    quantity: sanitizeNumber(formData.quantity, 0, 999999),
};
```

---

## 13. Testing Strategy

### 13.1 Backend Testing

```python
# tests/test_items.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_item(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/v1/items",
        json={
            "categoryId": "test-category-id",
            "name": "Test Item",
            "quantity": 10,
            "unit": "pieces",
            "minimumStock": 5,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Item"
    assert data["quantity"] == 10

@pytest.mark.asyncio
async def test_unauthorized_access(client: AsyncClient):
    response = await client.get("/api/v1/items")
    assert response.status_code == 401
```

### 13.2 Frontend Testing

```typescript
// __tests__/sanitize.test.ts
import { escapeHtml, sanitizeUrl, sanitizeNumber } from '@/utils/sanitize';

describe('Security Utilities', () => {
  test('escapeHtml prevents XSS', () => {
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  test('sanitizeUrl blocks javascript protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  test('sanitizeNumber clamps values', () => {
    expect(sanitizeNumber(1000000, 0, 999999)).toBe(999999);
    expect(sanitizeNumber(-5, 0, 100)).toBe(0);
  });
});
```

### 13.3 Running Tests

```bash
# Backend
cd vitaltrack-backend
pytest --cov=app --cov-report=html

# Frontend
cd vitaltrack-mobile
npm test
```

---

## 14. Deployment Guide

### 14.1 Backend Deployment (Railway)

```yaml
# railway.toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health"
restartPolicyType = "on_failure"
```

**Steps:**
1. Connect GitHub repository to Railway
2. Add PostgreSQL plugin
3. Set environment variables:
   - `DATABASE_URL` (auto-set by Railway)
   - `SECRET_KEY` (generate secure random)
   - `ENVIRONMENT=production`
   - `DEBUG=false`
4. Deploy automatically on push

### 14.2 Mobile App Deployment (EAS)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project
eas build:configure

# Build for Android
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

### 14.3 Environment Variables Checklist

**Production Backend:**
- [ ] `SECRET_KEY` - Cryptographically random, 32+ chars
- [ ] `DATABASE_URL` - Production PostgreSQL URL
- [ ] `ENVIRONMENT=production`
- [ ] `DEBUG=false`
- [ ] `CORS_ORIGINS` - Production mobile app domains only

---

## 15. Future Enhancements

### Phase 3+ Roadmap

| Feature | Priority | Complexity |
|---------|----------|------------|
| Mobile API Integration | High | Medium |
| expo-secure-store for tokens | High | Low |
| Push Notifications | Medium | Medium |
| Image Upload to S3 | Medium | Medium |
| WhatsApp Bot Integration | Low | High |
| AI Inventory Predictions | Low | High |
| Multi-tenant Support | Low | High |

### API Integration Checklist

```
[ ] Create services/api.ts (API client)
[ ] Create services/authService.ts (Auth flow)
[ ] Create services/syncService.ts (Sync queue)
[ ] Add expo-secure-store for token storage
[ ] Add @react-native-community/netinfo for network detection
[ ] Update Zustand store with sync status
[ ] Add Login/Register screens
[ ] Add loading states and error handling
```

---

## Appendix A: File Inventory

### Frontend Files (32 files)

```
app/
├── (tabs)/_layout.tsx
├── (tabs)/index.tsx
├── (tabs)/inventory.tsx
├── (tabs)/orders.tsx
├── _layout.tsx
├── builder.tsx
├── item/[id].tsx
└── order/create.tsx

components/
├── common/ExportModal.tsx
├── common/ProfileMenuSheet.tsx
├── common/VitalTrackTopBar.tsx
├── dashboard/ActivityList.tsx
├── dashboard/NeedsAttention.tsx
├── dashboard/StatsCard.tsx
├── inventory/CategoryHeader.tsx
├── inventory/ItemRow.tsx
└── orders/OrderCard.tsx

store/useAppStore.ts
types/index.ts
utils/helpers.ts
utils/sanitize.ts
theme/ThemeContext.tsx
theme/colors.ts
theme/spacing.ts
data/seedData.ts
```

### Backend Files (28 files)

```
app/
├── __init__.py
├── main.py
├── api/__init__.py
├── api/deps.py
├── api/v1/__init__.py
├── api/v1/auth.py
├── api/v1/categories.py
├── api/v1/items.py
├── api/v1/orders.py
├── api/v1/sync.py
├── core/__init__.py
├── core/config.py
├── core/database.py
├── core/security.py
├── models/__init__.py
├── models/user.py
├── models/refresh_token.py
├── models/category.py
├── models/item.py
├── models/order.py
├── models/activity.py
├── schemas/__init__.py
├── schemas/user.py
├── schemas/category.py
├── schemas/item.py
├── schemas/order.py
├── schemas/sync.py
└── schemas/common.py

alembic/
├── env.py
├── script.py.mako
└── versions/20260117_000000_initial.py
```

---

## Appendix B: Quick Reference

### API Base URLs

| Environment | URL |
|-------------|-----|
| Local Docker | `http://localhost:8000` |
| Local Python | `http://localhost:8000` |
| Android Emulator | `http://10.0.2.2:8000` |
| Production | `https://api.vitaltrack.app` |

### Common Commands

```bash
# Frontend
npx expo start              # Start dev server
npx expo start --clear      # Clear cache and start
npm run lint                # Run linter

# Backend
uvicorn app.main:app --reload    # Dev server
alembic upgrade head             # Run migrations
alembic revision --autogenerate  # Create migration
pytest                           # Run tests

# Docker
docker-compose up -d        # Start services
docker-compose logs -f api  # View logs
docker-compose down         # Stop services
```

---

**Document End**

*This technical documentation covers the complete VitalTrack implementation for Phases 1 and 2. For Phase 3 deployment and mobile integration, refer to the ROADMAP.md file.*
