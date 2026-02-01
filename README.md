# VitalTrack - Medical Inventory Management

> Track life-critical medical supplies for home ICU care. Never run out of essential items.

[![React Native](https://img.shields.io/badge/React%20Native-Expo%20SDK%2054-61DAFB?logo=react)](https://reactnative.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org)

## Quick Links

| I want to... | Go to |
|--------------|-------|
| Run locally in 30 min | [Quick Start](docs/NEW_DEVELOPER_QUICKSTART.md) |
| Deep dive setup + troubleshooting | [Complete Local Testing Guide](docs/LOCAL_TESTING_COMPLETE_GUIDE.md) |
| Connect phone via USB | [USB ADB Guide](docs/USB_ADB_REVERSE_GUIDE.md) |
| Understand technical decisions | [Technical Challenges](docs/TECHNICAL_CHALLENGES.md) |
| Deploy to production | [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) |
| Learn Git workflow | [Git Workflow Guide](docs/GIT_WORKFLOW_GUIDE.md) |
| Contribute code | [Contributing](CONTRIBUTING.md) |
| Backend API reference | [Backend README](vitaltrack-backend/README.md) |
| Mobile app details | [Mobile README](vitaltrack-mobile/README.md) |

## Instant Start (5 Commands)

```bash
git clone https://github.com/rishabhrd09/vitaltrack.git && cd vitaltrack
./setup-local-dev.sh                                    # Mac/Linux (or .bat for Windows)
cd vitaltrack-backend && docker-compose -f docker-compose.dev.yml up --build -d
cd ../vitaltrack-mobile && npm install --legacy-peer-deps && npx expo start --clear
# Scan QR with Expo Go → Create account → Done!
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Mobile** | React Native, Expo SDK 54, TypeScript, Zustand |
| **Backend** | FastAPI, SQLAlchemy 2.0 (Async), Alembic, Argon2 |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT + Refresh Token Rotation |
| **CI/CD** | GitHub Actions, Railway, EAS Build |

## Features

✅ Offline-first inventory management  
✅ Emergency backup alerts for critical equipment  
✅ Order tracking with PDF export  
✅ Cloud sync across devices  
✅ Secure JWT authentication  

## Project Status: Production Ready ✅

| Phase | Status |
|-------|--------|
| Frontend Development | ✅ Complete |
| Backend Integration | ✅ Complete |
| Production Deployment | ✅ Ready |

---

**[Start Here →](docs/NEW_DEVELOPER_QUICKSTART.md)**
