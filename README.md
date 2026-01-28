# 🏥 VitalTrack - Medical Inventory Management

> A complete mobile application for families managing home ICU medical supplies.

[![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Frontend](https://img.shields.io/badge/Frontend-React%20Native-61DAFB?style=flat-square&logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?style=flat-square&logo=expo)](https://expo.dev)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?style=flat-square&logo=github-actions)](https://github.com/features/actions)

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
| [NEW_DEVELOPER_ONBOARDING.md](./NEW_DEVELOPER_ONBOARDING.md) | **New developers start here!** Quick onboarding guide |
| [VITALTRACK_COMPLETE_DEVELOPER_GUIDE.md](./VITALTRACK_COMPLETE_DEVELOPER_GUIDE.md) | Complete guide: setup, workflow, deployment, and more |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to contribute: branching, PRs, code review |

---

## 🔄 Development Workflow

We use a **professional PR-based workflow**:

```
1. git checkout -b feature/my-feature    # Create branch
2. <make changes>                         # Work locally
3. git commit -m "feat: description"      # Commit
4. git push origin feature/my-feature     # Push branch
5. Create Pull Request on GitHub          # Open PR
6. CI tests run automatically             # Automated checks
7. Get code review approval               # Peer review
8. Merge → Auto-deploy                    # Production!
```

⚠️ **Never push directly to `main`** - all changes go through Pull Requests.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full workflow details.

---

## 🏗️ Project Structure

```
vitaltrack/
├── .github/
│   ├── workflows/ci.yml       # CI/CD Pipeline
│   ├── CODEOWNERS             # Auto-assign reviewers
│   └── pull_request_template.md
├── vitaltrack-backend/        # FastAPI + PostgreSQL (36 Python files)
├── vitaltrack-mobile/         # React Native + Expo (40 TypeScript files)
├── CONTRIBUTING.md            # Contribution guidelines
├── NEW_DEVELOPER_ONBOARDING.md
└── VITALTRACK_COMPLETE_DEVELOPER_GUIDE.md
```

---

## 🔧 Technology Stack

### Backend
- **FastAPI** - Modern Python web framework
- **PostgreSQL 16** - Database
- **SQLAlchemy 2.0** - Async ORM
- **Alembic** - Migrations
- **Docker** - Containerization

### Frontend
- **React Native** - Cross-platform mobile
- **Expo SDK 54** - Development platform
- **Zustand** - State management
- **expo-secure-store** - Encrypted storage
- **TypeScript** - Type safety

### DevOps
- **Railway** - Cloud hosting
- **EAS Build** - Mobile builds
- **GitHub Actions** - CI/CD with branch protection

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

### Backend (Railway)
```bash
railway login
cd vitaltrack-backend
railway init
railway add  # Select PostgreSQL
railway up
```

### Mobile App (EAS Build)
```bash
cd vitaltrack-mobile
eas login
eas build --profile preview --platform android   # For testing
eas build --profile production --platform android # For Play Store
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
| CI/CD & Branch Protection | ✅ Complete |

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

**Quick summary:**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes and test locally
4. Push and create a Pull Request
5. Pass CI checks and get review approval
6. Merge!

---

## 📄 License

This project is for educational and portfolio purposes.

---

**Happy coding! 🚀**
