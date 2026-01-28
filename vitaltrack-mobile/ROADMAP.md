# VitalTrack Development Roadmap: Dev to Production

## Complete 3-Phase Strategy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     VITALTRACK DEVELOPMENT PHASES                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  PHASE 1: Frontend Complete                     ████████████░░░░  5-7 days│
│  ├─ Expo React Native app                                                 │
│  ├─ Local storage (AsyncStorage + Zustand)                                │
│  ├─ Test on Expo Go (real device)                                         │
│  └─ All features working offline                                          │
│                                                                           │
│  PHASE 2: Backend Integration                   ████████████░░░░  5-7 days│
│  ├─ FastAPI backend setup                                                 │
│  ├─ PostgreSQL database                                                   │
│  ├─ JWT Authentication                                                    │
│  ├─ API integration in mobile app                                         │
│  └─ Offline-first sync architecture                                       │
│                                                                           │
│  PHASE 3: Production Deployment                 ████████░░░░░░░░  3-5 days│
│  ├─ EAS Build configuration                                               │
│  ├─ Play Store submission                                                 │
│  ├─ Backend deployment (Railway/Render)                                   │
│  └─ CI/CD pipeline setup                                                  │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Frontend Development (Current) ✅

### Status: IMPLEMENTED

### Deliverables
| Component | Status | Description |
|-----------|--------|-------------|
| Project Setup | ✅ | Expo + TypeScript + Zustand |
| Dashboard Screen | ✅ | Stats, needs attention, activity |
| Inventory Screen | ✅ | Categories, search, dual view |
| Orders Screen | ✅ | Order list with status tracking |
| Item Form | ✅ | Add/edit items with all fields |
| Create Order | ✅ | Select items, generate PDF |
| Data Persistence | ✅ | AsyncStorage with Zustand |
| Theme System | ✅ | Groww-inspired dark theme |

### Testing Requirements
- [ ] Test all screens on Expo Go
- [ ] Verify data persistence
- [ ] Test PDF generation
- [ ] Test order workflow
- [ ] Verify search functionality

### Success Criteria
```
✓ App runs on Expo Go without crashes
✓ All CRUD operations work
✓ Data persists after app restart
✓ PDF exports successfully
✓ UI matches Kotlin app design
```

---

## Phase 2: Backend Integration

### 2.1 FastAPI Backend Setup

#### Project Structure
```
vitaltrack-backend/
├── alembic/                    # Database migrations
│   ├── versions/
│   └── env.py
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app entry
│   ├── config.py               # Settings & env vars
│   ├── database.py             # SQLAlchemy setup
│   ├── models/                 # Database models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── category.py
│   │   ├── item.py
│   │   ├── order.py
│   │   └── activity.py
│   ├── schemas/                # Pydantic schemas
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── category.py
│   │   ├── item.py
│   │   └── order.py
│   ├── api/                    # API routes
│   │   ├── __init__.py
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── categories.py
│   │   │   ├── items.py
│   │   │   ├── orders.py
│   │   │   └── sync.py
│   │   └── deps.py             # Dependencies
│   ├── services/               # Business logic
│   │   ├── auth.py
│   │   └── sync.py
│   └── utils/
│       └── security.py         # JWT helpers
├── requirements.txt
├── alembic.ini
└── Dockerfile
```

#### API Endpoints
```
Authentication:
POST   /api/v1/auth/register     # Create account
POST   /api/v1/auth/login        # Get tokens
POST   /api/v1/auth/refresh      # Refresh token
POST   /api/v1/auth/logout       # Invalidate token

Categories:
GET    /api/v1/categories        # List all
POST   /api/v1/categories        # Create
GET    /api/v1/categories/{id}   # Get one
PUT    /api/v1/categories/{id}   # Update
DELETE /api/v1/categories/{id}   # Delete

Items:
GET    /api/v1/items             # List all (with filters)
POST   /api/v1/items             # Create
GET    /api/v1/items/{id}        # Get one
PUT    /api/v1/items/{id}        # Update
PATCH  /api/v1/items/{id}/stock  # Update stock only
DELETE /api/v1/items/{id}        # Delete

Orders:
GET    /api/v1/orders            # List all
POST   /api/v1/orders            # Create
GET    /api/v1/orders/{id}       # Get one
PATCH  /api/v1/orders/{id}/status # Update status
DELETE /api/v1/orders/{id}       # Delete

Sync:
POST   /api/v1/sync/push         # Push local changes
GET    /api/v1/sync/pull         # Pull server changes
POST   /api/v1/sync/full         # Full sync
```

#### Database Models
```python
# Example: Item model
class Item(Base):
    __tablename__ = "items"
    
    id = Column(UUID, primary_key=True, default=uuid4)
    user_id = Column(UUID, ForeignKey("users.id"), nullable=False)
    category_id = Column(UUID, ForeignKey("categories.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    quantity = Column(Integer, default=0)
    unit = Column(String(50), default="pieces")
    minimum_stock = Column(Integer, default=0)
    expiry_date = Column(Date)
    brand = Column(String(255))
    supplier_name = Column(String(255))
    supplier_contact = Column(String(255))
    purchase_link = Column(String(500))
    notes = Column(Text)
    image_uri = Column(String(500))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # For sync
    local_id = Column(String(36))  # Client-side UUID
    sync_status = Column(String(20), default="synced")
    last_synced_at = Column(DateTime)
```

### 2.2 Mobile App API Integration

#### API Service Layer
```typescript
// services/api.ts
const API_URL = process.env.EXPO_PUBLIC_API_URL;

class ApiService {
  private token: string | null = null;

  async setToken(token: string) {
    this.token = token;
    await SecureStore.setItemAsync('auth_token', token);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    return response.json();
  }

  // Items
  async getItems(): Promise<Item[]> {
    return this.request('/api/v1/items');
  }

  async createItem(item: Partial<Item>): Promise<Item> {
    return this.request('/api/v1/items', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  // ... more methods
}

export const api = new ApiService();
```

#### Offline-First Sync Queue
```typescript
// services/syncQueue.ts
interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: 'item' | 'category' | 'order';
  data: any;
  timestamp: string;
  retryCount: number;
}

class SyncQueue {
  private queue: SyncOperation[] = [];

  async addOperation(op: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>) {
    const operation: SyncOperation = {
      ...op,
      id: generateId(),
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };
    this.queue.push(operation);
    await this.persistQueue();
  }

  async processQueue() {
    const isOnline = await NetInfo.fetch().then(state => state.isConnected);
    if (!isOnline) return;

    for (const op of this.queue) {
      try {
        await this.executeOperation(op);
        await this.removeOperation(op.id);
      } catch (error) {
        if (op.retryCount < 3) {
          op.retryCount++;
          await this.persistQueue();
        } else {
          // Move to failed queue for manual resolution
          await this.moveToFailed(op);
        }
      }
    }
  }

  private async executeOperation(op: SyncOperation) {
    switch (op.entity) {
      case 'item':
        if (op.type === 'create') await api.createItem(op.data);
        if (op.type === 'update') await api.updateItem(op.data.id, op.data);
        if (op.type === 'delete') await api.deleteItem(op.data.id);
        break;
      // ... handle other entities
    }
  }
}
```

### 2.3 Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Mobile    │     │   FastAPI   │     │  PostgreSQL │
│    App      │     │   Backend   │     │   Database  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  POST /auth/login │                   │
       │ {email, password} │                   │
       │──────────────────>│                   │
       │                   │  Verify user      │
       │                   │──────────────────>│
       │                   │<──────────────────│
       │                   │                   │
       │  {access_token,   │                   │
       │   refresh_token}  │                   │
       │<──────────────────│                   │
       │                   │                   │
       │ Store in SecureStore                  │
       │                   │                   │
       │  GET /items       │                   │
       │  Authorization:   │                   │
       │  Bearer <token>   │                   │
       │──────────────────>│                   │
       │                   │  Validate JWT     │
       │                   │  Query items      │
       │                   │──────────────────>│
       │                   │<──────────────────│
       │   [items array]   │                   │
       │<──────────────────│                   │
       │                   │                   │
```

### 2.4 Phase 2 Implementation Order

```
Week 1:
├── Day 1-2: FastAPI project setup
│   ├── Project structure
│   ├── Database models
│   ├── Alembic migrations
│   └── Basic CRUD endpoints
│
├── Day 3-4: Authentication
│   ├── User model & registration
│   ├── JWT token generation
│   ├── Refresh token rotation
│   └── Protected routes
│
└── Day 5: API testing
    ├── Test all endpoints with Postman
    ├── Verify JWT flow
    └── Test error handling

Week 2:
├── Day 1-2: Mobile API integration
│   ├── API service layer
│   ├── Auth screens (login/register)
│   ├── Token storage (SecureStore)
│   └── API calls for all entities
│
├── Day 3-4: Offline-first sync
│   ├── Sync queue implementation
│   ├── Network state detection
│   ├── Background sync triggers
│   └── Conflict resolution
│
└── Day 5: Integration testing
    ├── Test online/offline scenarios
    ├── Test sync queue
    └── Test auth persistence
```

---

## Phase 3: Production Deployment

### 3.1 EAS Build Configuration

#### eas.json
```json
{
  "cli": {
    "version": ">= 7.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "gradleCommand": ":app:assembleDebug"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://staging-api.vitaltrack.app"
      }
    },
    "production": {
      "autoIncrement": true,
      "android": {
        "buildType": "app-bundle"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.vitaltrack.app"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

#### app.config.js (Dynamic Configuration)
```javascript
const IS_PROD = process.env.EAS_BUILD_PROFILE === 'production';

export default {
  expo: {
    name: IS_PROD ? 'VitalTrack' : 'VitalTrack (Dev)',
    slug: 'vitaltrack-mobile',
    version: '1.0.0',
    android: {
      package: IS_PROD ? 'com.vitaltrack.app' : 'com.vitaltrack.app.dev',
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#121214',
      },
      permissions: [
        'CAMERA',
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
      ],
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      eas: {
        projectId: 'your-project-id',
      },
    },
  },
};
```

### 3.2 Play Store Requirements

#### Required Assets
| Asset | Size | Format |
|-------|------|--------|
| App Icon | 512 × 512 px | PNG (32-bit with alpha) |
| Feature Graphic | 1024 × 500 px | PNG/JPEG |
| Phone Screenshots | 1080 × 1920 px min | PNG/JPEG (2-8 images) |
| Tablet Screenshots | 1600 × 2560 px | PNG/JPEG (if targeting tablets) |

#### Store Listing Content
```
App Name: VitalTrack - Medical Inventory
Short Description (80 chars):
"Track medical supplies for home ICU care. Never run out of critical items."

Full Description (4000 chars):
- App features
- Use cases
- Privacy information
- Contact details
```

#### Data Safety Declaration
- Data collected: Email, name (for account)
- Data shared: None
- Data encrypted: Yes (in transit)
- Data deletion: Available on request

### 3.3 Backend Deployment

#### Railway/Render Deployment
```yaml
# railway.toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[[services]]
name = "vitaltrack-api"
region = "us-west1"

[env]
DATABASE_URL = { secret = true }
JWT_SECRET = { secret = true }
```

#### Environment Variables
```
DATABASE_URL=postgresql://user:pass@host:5432/vitaltrack
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_ACCESS_EXPIRE_MINUTES=30
JWT_REFRESH_EXPIRE_DAYS=30
CORS_ORIGINS=https://vitaltrack.app
```

### 3.4 CI/CD Pipeline

#### GitHub Actions Workflow
```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: test_db
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: pytest --cov=app

  test-mobile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit

  build-preview:
    needs: [test-backend, test-mobile]
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      - run: eas build --profile preview --platform android --non-interactive

  deploy-production:
    needs: [test-backend, test-mobile]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Deploy backend
      - uses: railwayapp/deploy-action@v1
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
      # Build mobile app
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      - run: eas build --profile production --platform android --non-interactive --auto-submit
```

### 3.5 Phase 3 Checklist

```
Pre-Submission:
□ App icon meets specifications
□ Feature graphic created
□ Screenshots captured (all screens)
□ Store listing written
□ Privacy policy URL ready
□ Data safety form completed
□ App tested on multiple devices

Build & Submit:
□ eas.json configured
□ Google Service Account JSON obtained
□ Run: eas build --profile production
□ Run: eas submit --platform android

Post-Submission:
□ Monitor Play Console for review status
□ Respond to any policy issues
□ Set up staged rollout (5% → 25% → 100%)
□ Monitor crash reports in Play Console
□ Set up Sentry for error tracking
```

---

## Timeline Summary

| Phase | Duration | Key Milestone |
|-------|----------|---------------|
| Phase 1 | 5-7 days | Working app on Expo Go |
| Phase 2 | 5-7 days | Backend integrated, sync working |
| Phase 3 | 3-5 days | App live on Play Store |
| **Total** | **13-19 days** | **Production deployment** |

---

## Quick Reference Commands

```bash
# Phase 1 - Development
npx expo start                    # Start dev server
npx expo start --clear            # Clear cache and start
npx expo start --tunnel           # Use tunnel for remote testing

# Phase 2 - Backend
uvicorn app.main:app --reload     # Start FastAPI dev server
alembic upgrade head              # Run migrations
pytest                            # Run tests

# Phase 3 - Production
eas build --profile preview       # Build preview APK
eas build --profile production    # Build production AAB
eas submit --platform android     # Submit to Play Store
```

---

## Next Immediate Action

**Complete Phase 1 testing on Expo Go, then proceed to Phase 2 backend development.**

Use the `PHASE1_SETUP_GUIDE.md` file for detailed testing instructions.
