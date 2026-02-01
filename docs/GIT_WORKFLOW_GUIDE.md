# Git Workflow Guide

> **Professional PR-based workflow** for both collaborators and fork contributors.

---

## Workflow Overview

```
                    VITALTRACK GIT WORKFLOW
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   1. Create Branch    2. Make Changes    3. Push Branch        │
│   ─────────────────   ──────────────────   ─────────────────   │
│   feature/my-feature  Edit, test, commit   git push origin      │
│                                                                 │
│                            ↓                                    │
│                                                                 │
│   4. Open PR          5. CI Tests         6. Code Review       │
│   ─────────────────   ──────────────────   ─────────────────   │
│   GitHub UI           Automatic           Team approval         │
│                                                                 │
│                            ↓                                    │
│                                                                 │
│   7. Merge            8. Auto Deploy      9. Celebrate! 🎉     │
│   ─────────────────   ──────────────────   ─────────────────   │
│   Squash & merge      Railway + EAS       Feature live!        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## For Collaborators (Direct Access)

### Initial Setup (Once)
```bash
git clone https://github.com/rishabhrd09/vitaltrack.git
cd vitaltrack
```

### Daily Workflow

#### Step 1: Update main branch
```bash
git checkout main
git pull origin main
```

#### Step 2: Create feature branch
```bash
git checkout -b feature/add-export-button
```

**Branch naming convention:**
| Prefix | Use Case |
|--------|----------|
| `feature/` | New features |
| `fix/` | Bug fixes |
| `hotfix/` | Urgent production fixes |
| `docs/` | Documentation updates |
| `refactor/` | Code refactoring |

#### Step 3: Make changes
```bash
# Edit files...
# Test locally...

git add .
git commit -m "feat: add export button to inventory screen"
```

**Commit message format:**
```
type: short description

- feat: new feature
- fix: bug fix
- docs: documentation
- refactor: code change (no feature/fix)
- test: adding tests
- chore: maintenance
```

#### Step 4: Push branch
```bash
git push origin feature/add-export-button
```

#### Step 5: Open Pull Request
1. Go to GitHub repository
2. Click "Compare & pull request" (appears automatically)
3. Fill in PR template
4. Request reviewers
5. Submit PR

#### Step 6: Wait for CI
CI automatically runs:
- Backend tests (Python)
- Frontend tests (TypeScript)
- Security scan

All checks must pass before merge.

#### Step 7: Address review feedback
```bash
# Make requested changes
git add .
git commit -m "fix: address review feedback"
git push origin feature/add-export-button
```

#### Step 8: Merge
Once approved:
1. Click "Squash and merge"
2. Confirm merge
3. Delete branch (GitHub prompts this)

#### Step 9: Clean up locally
```bash
git checkout main
git pull origin main
git branch -d feature/add-export-button
```

---

## For Fork Contributors (External)

### Initial Setup (Once)

#### Step 1: Fork the repository
Click "Fork" on GitHub (top right)

#### Step 2: Clone your fork
```bash
git clone https://github.com/YOUR-USERNAME/vitaltrack.git
cd vitaltrack
```

#### Step 3: Add upstream remote
```bash
git remote add upstream https://github.com/rishabhrd09/vitaltrack.git
```

#### Step 4: Verify remotes
```bash
git remote -v
# Should show:
# origin    https://github.com/YOUR-USERNAME/vitaltrack.git (fetch)
# origin    https://github.com/YOUR-USERNAME/vitaltrack.git (push)
# upstream  https://github.com/rishabhrd09/vitaltrack.git (fetch)
# upstream  https://github.com/rishabhrd09/vitaltrack.git (push)
```

### Contributing Workflow

#### Step 1: Sync with upstream
```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
```

#### Step 2: Create feature branch
```bash
git checkout -b feature/my-contribution
```

#### Step 3: Make changes and commit
```bash
# Edit files...
git add .
git commit -m "feat: description of changes"
```

#### Step 4: Push to your fork
```bash
git push origin feature/my-contribution
```

#### Step 5: Open PR to upstream
1. Go to **original** repository (not your fork)
2. Click "New pull request"
3. Click "compare across forks"
4. Select your fork and branch
5. Fill in PR template
6. Submit PR

#### Step 6: Keep PR updated
If main has changed:
```bash
git checkout feature/my-contribution
git fetch upstream
git rebase upstream/main
git push origin feature/my-contribution --force
```

---

## Troubleshooting Decision Tree

```
PROBLEM: Can't push to origin
│
├─► "Permission denied"
│   └─► Are you a collaborator? If not, use Fork workflow
│
├─► "Updates were rejected"
│   └─► Pull first: git pull origin branch-name
│
└─► "Remote not found"
    └─► Check remote: git remote -v

PROBLEM: Merge conflicts
│
├─► Small conflict
│   └─► Fix in editor → git add . → git commit
│
└─► Complex conflict
    └─► Ask for help or start fresh branch

PROBLEM: Need to undo commit
│
├─► Last commit only
│   └─► git reset HEAD~1 (keeps changes)
│
└─► Multiple commits
    └─► git rebase -i HEAD~N (interactive)

PROBLEM: Wrong branch
│
├─► Committed to main by accident
│   └─► git checkout -b correct-branch
│       git checkout main
│       git reset HEAD~1 --hard
│       git checkout correct-branch
│
└─► Forgot to create branch
    └─► git stash
        git checkout -b new-branch
        git stash pop
```

---

## Branch Protection Rules

The `main` branch has these protections:

| Rule | Purpose |
|------|---------|
| Require PR | No direct pushes |
| Require CI pass | Tests must pass |
| Require review | At least 1 approval |
| No force push | History is sacred |

---

## PR Template

When you open a PR, fill in this template:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
- [ ] Tested locally
- [ ] Added/updated tests
- [ ] All tests pass

## Screenshots (if UI change)
[Add screenshots here]

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
```

---

## Common Git Commands

### Daily Use
```bash
# Update main
git checkout main && git pull

# Create branch
git checkout -b feature/name

# Stage and commit
git add .
git commit -m "type: message"

# Push branch
git push origin feature/name

# Delete local branch
git branch -d feature/name

# Delete remote branch
git push origin --delete feature/name
```

### Viewing History
```bash
# View log (pretty)
git log --oneline --graph

# View specific file history
git log --follow -p -- filename

# View changes in commit
git show commit-hash
```

### Undoing Things
```bash
# Undo unstaged changes
git checkout -- filename

# Undo staged changes
git reset HEAD filename

# Undo last commit (keep changes)
git reset HEAD~1

# Undo last commit (discard changes)
git reset HEAD~1 --hard
```

### Stashing
```bash
# Save work temporarily
git stash

# Restore stashed work
git stash pop

# List stashes
git stash list

# Apply specific stash
git stash apply stash@{0}
```

### Syncing (Fork)
```bash
# Fetch upstream changes
git fetch upstream

# Merge upstream into local main
git checkout main
git merge upstream/main

# Push to your fork
git push origin main
```

---

## Quick Reference Card

```
┌────────────────────────────────────────────────────────────┐
│                    GIT QUICK REFERENCE                      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  NEW FEATURE:                                              │
│  git checkout main && git pull                             │
│  git checkout -b feature/name                              │
│  # ... make changes ...                                    │
│  git add . && git commit -m "feat: description"            │
│  git push origin feature/name                              │
│  # ... open PR on GitHub ...                               │
│                                                            │
│  AFTER PR MERGED:                                          │
│  git checkout main && git pull                             │
│  git branch -d feature/name                                │
│                                                            │
│  SYNC FORK:                                                │
│  git fetch upstream                                        │
│  git checkout main                                         │
│  git merge upstream/main                                   │
│  git push origin main                                      │
│                                                            │
│  OOPS, WRONG BRANCH:                                       │
│  git stash                                                 │
│  git checkout correct-branch                               │
│  git stash pop                                             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Best Practices

1. **Keep PRs small** - Easier to review, faster to merge
2. **One feature per PR** - Don't mix unrelated changes
3. **Write good commit messages** - Future you will thank you
4. **Test before pushing** - CI is a safety net, not a test suite
5. **Respond to reviews promptly** - Keep momentum going
6. **Update your branch often** - Avoid merge conflicts
7. **Never force push to main** - Seriously, never

---

**Questions?** Ask in PR comments or open a discussion on GitHub.
