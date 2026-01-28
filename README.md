# 🏥 VitalTrack - Medical Inventory Management

> A complete mobile application for families managing home ICU medical supplies.

[![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Frontend](https://img.shields.io/badge/Frontend-React%20Native-61DAFB?style=flat-square&logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?style=flat-square&logo=expo)](https://expo.dev)

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites
- [Node.js 20+](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Expo Go](https://expo.dev/client) on your phone

### Step 1: Start Backend
```bash
cd vitaltrack-backend
docker-compose up --build
```
Wait for "Database tables created/verified"

### Step 2: Start Frontend
```bash
cd vitaltrack-mobile
npm install
npx expo start --clear
```
Scan QR code with Expo Go

### Step 3: Connect (for API integration)
```bash
# Run from project root
./setup-local-dev.sh    # Mac/Linux
setup-local-dev.bat     # Windows
```
Then restart both backend and frontend.

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [COMPLETE_STEP_BY_STEP_FLOW.md](./COMPLETE_STEP_BY_STEP_FLOW.md) | **START HERE! Complete flow from zero to Play Store** |
| [VITALTRACK_MASTER_GUIDE.md](./VITALTRACK_MASTER_GUIDE.md) | Detailed technical guide |
| [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) | Printable checklist |

---

## 🏗️ Project Structure

```
vitaltrack/
├── vitaltrack-backend/          # FastAPI + PostgreSQL backend
├── vitaltrack-mobile/           # React Native + Expo mobile app
├── .github/workflows/           # CI/CD pipeline
└── *.md                         # Documentation
```

---

## 🔧 Technology Stack

### Backend
- **FastAPI** - Modern Python web framework
- **PostgreSQL 16** - Database
- **SQLAlchemy 2.0** - ORM
- **Alembic** - Migrations
- **Docker** - Containerization

### Frontend
- **React Native** - Cross-platform mobile
- **Expo SDK 54** - Development platform
- **Zustand** - State management
- **expo-secure-store** - Encrypted storage
- **TypeScript** - Type safety

### DevOps
- **Railway/Render** - Cloud hosting
- **EAS Build** - Mobile builds
- **GitHub Actions** - CI/CD

---

## 📱 Features

- ✅ **Inventory Management** - Track medical supplies by category
- ✅ **Low Stock Alerts** - Visual indicators for items below minimum
- ✅ **Order Management** - Create and track restock orders
- ✅ **Offline Support** - Works without internet connection
- ✅ **Secure Authentication** - JWT with auto-refresh
- ✅ **Cloud Sync** - Data synced across devices

---

## 🔐 API Endpoints (34 Total)

| Category | Endpoints |
|----------|-----------|
| Authentication | 11 (register, login, refresh, logout, etc.) |
| Categories | 6 (CRUD + count) |
| Items | 8 (CRUD + stats + filters) |
| Orders | 6 (CRUD + status + apply) |
| Sync | 3 (push, pull, full) |

API Documentation: `http://localhost:8000/docs`

---

## 🚢 Deployment

### Backend (choose one)
```bash
# Railway
railway login
cd vitaltrack-backend
railway init
railway add  # Select PostgreSQL
railway up

# Render
# Push to GitHub, connect repo in Render dashboard
```

### Mobile App
```bash
cd vitaltrack-mobile

# Preview build (testing)
eas build --profile preview --platform android

# Production build (Play Store)
eas build --profile production --platform android
```

---

## 🔑 Environment Variables

### Backend
```env
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
SECRET_KEY=your-64-char-secret
ENVIRONMENT=production
```

### Frontend
```env
EXPO_PUBLIC_API_URL=https://your-backend-url.com
```

---

## 📊 Development Status

| Phase | Status |
|-------|--------|
| Phase 1: Frontend | ✅ Complete |
| Phase 2: Backend | ✅ Complete |
| Phase 3: Deployment | ✅ Complete |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

This project is for educational and portfolio purposes.

---

