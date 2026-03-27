# Testing & Build Quick Reference

> **One-page cheat sheet** for every way to test, preview, and deploy VitalTrack.
> Updated: March 2026

---

## 1. Local Preview WITHOUT Pushing (Expo Go)

**Best for:** Quick UI checks, feature testing before committing. No APK build needed.

```bash
# Terminal 1 — Backend (Docker)
cd vitaltrack-backend
docker-compose -f docker-compose.dev.yml up --build -d

# Terminal 2 — Mobile (Expo Dev Server)
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
```

**On your phone:**
1. Install **Expo Go** from Play Store / App Store
2. Scan the QR code shown in terminal
3. App loads instantly — changes hot-reload in ~1 second

**USB debugging (no WiFi needed):**
```bash
# Connect phone via USB, enable USB Debugging in Developer Options
adb reverse tcp:8081 tcp:8081    # Expo bundler
adb reverse tcp:8000 tcp:8000    # Backend API

# Then start Expo
npx expo start --clear
# On phone: open Expo Go → type: exp://localhost:8081
```

**Stop everything:**
```bash
# Stop backend
cd vitaltrack-backend && docker-compose -f docker-compose.dev.yml down

# Stop Expo: Ctrl+C in terminal
```

---

## 2. Preview APK Build (No Push Required)

**Best for:** Testing the actual installable APK before pushing to any branch.

```bash
cd vitaltrack-mobile

# Build preview APK locally (uploads to EAS cloud, builds there)
npx eas build --profile preview --platform android --non-interactive

# Build takes ~5-10 minutes
# Download link appears when done — install on any Android device
```

**Note:** This builds from your LOCAL code, not from GitHub. You can test unreleased changes.

---

## 3. Preview APK from a Feature Branch

**Best for:** Testing a feature branch APK before merging to main.

```bash
# Create and switch to feature branch
git checkout -b feat/my-feature
# ... make changes ...
git add . && git commit -m "feat: my changes"
git push -u origin feat/my-feature

# Build APK from this branch
cd vitaltrack-mobile
npx eas build --profile preview --platform android --non-interactive
```

---

## 4. Run Backend Tests (Local)

**Best for:** Verifying auth, security, and API tests before pushing.

**Requires:** PostgreSQL running (via Docker or local install)

```bash
cd vitaltrack-backend

# Option A: Use Docker PostgreSQL
docker run -d --name vt-test-db \
  -e POSTGRES_DB=test_db \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  -p 5432:5432 postgres:16

# Run tests
DATABASE_URL=postgresql+asyncpg://test:test@localhost:5432/test_db \
SECRET_KEY=test-secret-key-minimum-32-chars-long \
ENVIRONMENT=testing \
python -m pytest tests/ -v --tb=short

# Cleanup
docker stop vt-test-db && docker rm vt-test-db
```

**Option B: Just push and let CI run tests (easier)**
```bash
git push origin feat/my-feature
# CI runs automatically on PR or push to main
# Check: https://github.com/rishabhrd09/vitaltrack/actions
```

---

## 5. Run Frontend Checks (Local)

**Best for:** Catching TypeScript errors and lint issues before CI.

```bash
cd vitaltrack-mobile

# TypeScript check (catches compile errors)
npx tsc --noEmit

# ESLint (catches code quality issues)
npm run lint

# Both must pass for CI to succeed
```

---

## 6. CI/CD Pipeline (Automatic)

**Triggers automatically on:**
- Push to `main`
- Pull request targeting `main`

**What CI runs:**
| Step | Tool | What it checks |
|------|------|---------------|
| Backend lint | Ruff | Code style (app/ only) |
| Backend types | mypy | Type hints (warnings only) |
| Backend tests | pytest | 73 tests with PostgreSQL 16 |
| Frontend types | tsc | TypeScript compilation |
| Frontend lint | ESLint | Code quality |
| Expo doctor | expo-doctor | Expo config |

**Check CI status:**
```bash
# View in browser
# https://github.com/rishabhrd09/vitaltrack/actions

# Or via GitHub API
curl -s https://api.github.com/repos/rishabhrd09/vitaltrack/actions/runs?per_page=3 \
  | python -c "import sys,json; [print(f'#{r[\"run_number\"]} {r[\"conclusion\"]} - {r[\"display_title\"]}') for r in json.load(sys.stdin)['workflow_runs']]"
```

---

## 7. Feature Branch Workflow (Full Cycle)

```bash
# 1. Create branch
git checkout main && git pull origin main
git checkout -b feat/my-feature

# 2. Make changes, test locally
npx tsc --noEmit                    # TypeScript check
npx expo start --clear              # Visual test with Expo Go

# 3. Commit
git add <files>
git commit -m "feat: description of changes"

# 4. Push feature branch
git push -u origin feat/my-feature

# 5. (Optional) Build preview APK from branch
cd vitaltrack-mobile
npx eas build --profile preview --platform android --non-interactive

# 6. Create PR when ready
gh pr create --title "feat: my feature" --body "Description"
# Or use GitHub web UI

# 7. CI runs on PR — wait for green
# 8. Merge after review
```

---

## 8. Merge to Main + Production Deploy

```bash
# Merge feature branch to main
git checkout main && git pull origin main
git merge feat/my-feature --no-edit
git push origin main

# CI runs automatically:
#   ✅ Tests pass → Render auto-deploys backend
#   ✅ Production AAB builds (if EXPO_TOKEN configured)

# Build production APK/AAB manually:
cd vitaltrack-mobile
npx eas build --profile production --platform android --non-interactive
```

---

## 9. Production AAB (Play Store)

```bash
cd vitaltrack-mobile

# Build production AAB (Android App Bundle for Play Store)
npx eas build --profile production --platform android --non-interactive

# Submit to Play Store (requires store setup)
npx eas submit --platform android
```

---

## 10. Quick Troubleshooting

| Problem | Fix |
|---------|-----|
| Expo Go can't connect | `adb reverse tcp:8081 tcp:8081` (USB) or check same WiFi |
| Backend not responding | `docker ps` — is container running? Check port 8000 |
| Tests fail locally | Ensure PostgreSQL is running on port 5432 |
| TypeScript errors | `npx tsc --noEmit` — fix errors before building |
| APK build fails | Check `npx tsc --noEmit` first — bundler errors = TS errors |
| CI fails | Check GitHub Actions logs for the specific failing step |
| Hot reload not working | Press `r` in Expo terminal, or restart `npx expo start --clear` |
| EAS build queued too long | Free tier has queue limits — wait or upgrade |

---

## Build Profiles Summary

| Profile | Command | Output | Use Case |
|---------|---------|--------|----------|
| **Local dev** | `npx expo start` | Expo Go on phone | Daily development |
| **Preview APK** | `eas build --profile preview` | .apk file | Team testing, QA |
| **Production AAB** | `eas build --profile production` | .aab file | Play Store upload |

---

## Test Suite Summary (73 tests)

| File | Tests | Type | What it covers |
|------|-------|------|---------------|
| `test_auth.py` | 54 | Integration | Registration, login, tokens, logout, password, sessions |
| `test_security.py` | 19 | Unit | Password hashing, JWT creation/verification, token types |

**Coverage:** 54% of backend code (auth: 97%, security: 97%, models: 85-95%)
