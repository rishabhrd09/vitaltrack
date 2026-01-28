# 🆕 VitalTrack: New Developer Onboarding Guide

**Quick Start for New Developers Joining the Project**

---

## 🎯 Your First Day Checklist

Complete these steps in order:

```
□ Step 1: Get the code (5 min)
□ Step 2: Run locally (10 min)
□ Step 3: Make your first change (5 min)
□ Step 4: Create your first PR (5 min)
```

---

## Step 1: Get the Code

### Fork & Clone

```bash
# 1. Go to GitHub and click "Fork"
#    https://github.com/rishabhrd09/vitaltrack

# 2. Clone YOUR fork
git clone https://github.com/YOUR_USERNAME/vitaltrack.git
cd vitaltrack

# 3. Add upstream (to sync later)
git remote add upstream https://github.com/rishabhrd09/vitaltrack.git
```

---

## Step 2: Run Locally

### Terminal 1: Backend

```bash
cd vitaltrack-backend
docker-compose up --build
```

Wait for: `Database tables created/verified`

### Terminal 2: Frontend

```bash
# First, run setup script (from project root)
./setup-local-dev.sh    # Mac/Linux
setup-local-dev.bat     # Windows

# Then start frontend
cd vitaltrack-mobile
npm install
npx expo start --clear
```

### Test

1. Scan QR with Expo Go
2. Tap "Create Account"
3. See Dashboard = ✅ Success!

---

## Step 3: Make Your First Change

### 🚨 IMPORTANT: Never Push to Main!

Always create a feature branch:

```bash
# 1. Make sure you're on main and up-to-date
git checkout main
git pull origin main

# 2. Create YOUR feature branch
git checkout -b feature/your-name-test

# 3. Make a small change
# Example: Edit vitaltrack-mobile/app/(tabs)/index.tsx
# Change "Dashboard" to "My Dashboard"

# 4. Test it (should hot-reload)

# 5. Commit
git add .
git commit -m "docs: test commit by YOUR_NAME"

# 6. Push YOUR branch (not main!)
git push origin feature/your-name-test
```

---

## Step 4: Create Your First PR

1. **Go to GitHub** → Your fork
2. Click **"Compare & pull request"**
3. **Fill in template:**
   - Description: "Test PR - learning the workflow"
   - Type: Documentation
4. **Submit PR**
5. **Watch CI run** → See tests pass
6. **Request review** from maintainer

### What Happens Next

```
Your PR
   │
   ├── CI runs automatically
   │   ├── Backend tests ✓
   │   └── Frontend tests ✓
   │
   ├── Code review
   │   └── Maintainer reviews & approves
   │
   └── Merge to main
       └── Auto-deploys!
```

---

## 🔑 Key Rules

### DO ✅

- Create feature branches for ALL changes
- Write descriptive commit messages
- Test locally before pushing
- Keep PRs small and focused

### DON'T ❌

- Push directly to `main`
- Merge your own PRs (get review first)
- Commit broken code
- Skip local testing

---

## Branch Naming

```bash
feature/add-scanner      # New feature
fix/login-crash          # Bug fix
docs/update-readme       # Documentation
refactor/auth-cleanup    # Code cleanup
```

---

## Common Commands

```bash
# Daily sync
git checkout main
git pull origin main
git fetch upstream
git merge upstream/main

# New feature
git checkout -b feature/my-feature

# After changes
git add .
git commit -m "feat: add new thing"
git push origin feature/my-feature

# Update branch with latest main
git checkout main
git pull origin main
git checkout feature/my-feature
git rebase main
```

---

## Getting Help

- 📖 Full guide: `VITALTRACK_COMPLETE_DEVELOPER_GUIDE.md`
- 📝 Contributing: `CONTRIBUTING.md`
- 🐛 Issues: Open on GitHub
- 💬 Questions: Tag `@rishabhrd09`

---

## Quick Links

| Resource | Purpose |
|----------|---------|
| http://localhost:8000/docs | API Documentation |
| http://localhost:8000/health | Backend Health Check |
| https://expo.dev | Mobile Build Dashboard |
| https://railway.app | Backend Hosting |

---

**Welcome to the team! 🎉**
