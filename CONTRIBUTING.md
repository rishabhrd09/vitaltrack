# Contributing to VitalTrack

Thank you for your interest in contributing to VitalTrack! This document explains our development workflow and contribution guidelines.

---

## 📋 Table of Contents

1. [Development Workflow](#development-workflow)
2. [Branch Naming Convention](#branch-naming-convention)
3. [Making Changes](#making-changes)
4. [Pull Request Process](#pull-request-process)
5. [Code Review Guidelines](#code-review-guidelines)
6. [Commit Message Convention](#commit-message-convention)

---

## Development Workflow

We follow a **Feature Branch Workflow** where:

1. The `main` branch is **protected** and always contains production-ready code
2. All changes must go through a **Pull Request (PR)**
3. PRs require **passing CI checks** before merge
4. PRs require **code review** approval before merge

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     VITALTRACK DEVELOPMENT WORKFLOW                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   main (protected)                                                           │
│   ════════════════════════════════════════════════════════════════════════  │
│         │                                           ▲                        │
│         │ 1. Create branch                          │ 6. Merge PR            │
│         ▼                                           │                        │
│   feature/my-feature ─────────────────────────────────                      │
│         │                                           │                        │
│         │ 2. Make changes                           │                        │
│         │ 3. Push to origin                         │                        │
│         │ 4. Create Pull Request ──────────────────►│                        │
│         │                                           │                        │
│         │ 5. CI runs automatically                  │                        │
│         │    ├── Backend tests                      │                        │
│         │    ├── Frontend tests                     │                        │
│         │    └── Security scan                      │                        │
│         │                                           │                        │
│         │ 5b. Code review required ────────────────►│                        │
│         │                                           │                        │
│         └───────────────────────────────────────────┘                        │
│                                                                              │
│   After merge to main:                                                       │
│   • Backend auto-deploys to Railway                                          │
│   • Production AAB builds automatically                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Branch Naming Convention

Use descriptive branch names with the following prefixes:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feature/` | New features | `feature/add-barcode-scanner` |
| `fix/` | Bug fixes | `fix/login-token-refresh` |
| `hotfix/` | Urgent production fixes | `hotfix/crash-on-startup` |
| `docs/` | Documentation updates | `docs/update-api-guide` |
| `refactor/` | Code refactoring | `refactor/optimize-queries` |
| `test/` | Adding/updating tests | `test/add-auth-tests` |
| `chore/` | Maintenance tasks | `chore/update-dependencies` |

### Branch Name Rules

- Use lowercase letters
- Use hyphens `-` to separate words (not underscores)
- Keep it short but descriptive
- Include ticket/issue number if applicable: `feature/VT-123-add-export`

---

## Making Changes

### Step 1: Sync with main

```bash
# Make sure you're on main
git checkout main

# Pull latest changes
git pull origin main
```

### Step 2: Create a feature branch

```bash
# Create and switch to new branch
git checkout -b feature/your-feature-name
```

### Step 3: Make your changes

```bash
# Work on your changes...
# Test locally with Docker + Expo Go

# Stage your changes
git add .

# Commit with descriptive message
git commit -m "feat: add barcode scanner to inventory"
```

### Step 4: Push your branch

```bash
# Push branch to GitHub
git push origin feature/your-feature-name
```

### Step 5: Create Pull Request

1. Go to GitHub repository
2. Click "Compare & pull request" (appears after push)
3. Fill in PR template
4. Request reviewers
5. Submit PR

---

## Pull Request Process

### Before Creating PR

- [ ] Code compiles without errors
- [ ] All tests pass locally
- [ ] Code follows project style guidelines
- [ ] Self-reviewed the changes
- [ ] Updated documentation if needed
- [ ] Added tests for new functionality

### PR Requirements

For a PR to be merged, it must:

1. **Pass all CI checks:**
   - ✅ Backend tests pass
   - ✅ Frontend tests pass
   - ✅ TypeScript compilation succeeds
   - ✅ Linting passes

2. **Have code review approval:**
   - At least 1 approval from code owner
   - All review comments addressed

3. **Be up to date with main:**
   - No merge conflicts
   - Branch is rebased on latest main

### After PR is Merged

- Delete the feature branch (GitHub can do this automatically)
- Deployment happens automatically:
  - Backend deploys to Railway
  - Production mobile build starts

---

## Code Review Guidelines

### For Authors

- Keep PRs focused and small (under 400 lines when possible)
- Write clear PR description explaining:
  - What changes were made
  - Why the changes were needed
  - How to test the changes
- Respond to review comments promptly
- Don't take feedback personally - it's about the code

### For Reviewers

- Review within 24 hours when possible
- Be constructive and respectful
- Explain the "why" behind suggestions
- Approve when satisfied, don't nitpick style

### What to Look For

- [ ] Code correctness and logic
- [ ] Security considerations
- [ ] Performance implications
- [ ] Error handling
- [ ] Code readability
- [ ] Test coverage

---

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code restructuring |
| `test` | Adding/updating tests |
| `chore` | Maintenance tasks |
| `perf` | Performance improvement |
| `ci` | CI/CD changes |

### Examples

```bash
# Feature
git commit -m "feat(auth): add biometric login support"

# Bug fix
git commit -m "fix(items): resolve stock calculation error"

# Documentation
git commit -m "docs: update API endpoint documentation"

# Multiple changes
git commit -m "feat(orders): add PDF export functionality

- Add PDF generation library
- Create export endpoint
- Add download button to UI

Closes #123"
```

---

## Quick Reference

### Common Git Commands

```bash
# Start new feature
git checkout main
git pull origin main
git checkout -b feature/my-feature

# Save work in progress
git add .
git commit -m "wip: work in progress"

# Update branch with latest main
git checkout main
git pull origin main
git checkout feature/my-feature
git rebase main

# Push changes
git push origin feature/my-feature

# Force push after rebase (only on your own branch!)
git push origin feature/my-feature --force-with-lease

# Delete local branch after merge
git branch -d feature/my-feature
```

### Useful Aliases

Add to your `~/.gitconfig`:

```ini
[alias]
    co = checkout
    br = branch
    ci = commit
    st = status
    new = checkout -b
    sync = !git checkout main && git pull origin main
```

---

## Need Help?

- Open an issue for bugs or feature requests
- Tag `@rishabhrd09` for questions
- Check existing PRs for examples

Happy coding! 🚀
