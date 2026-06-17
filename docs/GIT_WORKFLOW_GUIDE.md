# Git Workflow Guide

> The end-to-end PR-based workflow for CareKosh, for both collaborators and fork contributors.

Branch naming, commit conventions, and PR requirements are also documented in [../CAREKOSH_DEVELOPER_GUIDE.md §12](../CAREKOSH_DEVELOPER_GUIDE.md#12-contribution-workflow). This file expands on the daily git mechanics.

---

## Workflow overview

```
                    CAREKOSH GIT WORKFLOW
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   1. Branch from main  2. Make changes    3. Push branch        │
│   ───────────────────  ──────────────────  ──────────────────   │
│   feature/my-feature   Edit, test, commit  git push origin      │
│                                                                 │
│                            │                                    │
│                            ▼                                    │
│                                                                 │
│   4. Open PR           5. CI runs          6. Review            │
│   ───────────────────  ──────────────────  ──────────────────   │
│   GitHub UI            backend/frontend/   Team approval        │
│                        security/pr-check                        │
│                                                                 │
│                            │                                    │
│                            ▼                                    │
│                                                                 │
│   7. Merge             8. Auto-deploy      9. Verify            │
│   ───────────────────  ──────────────────  ──────────────────   │
│   squash or merge      Render (both svcs)  curl /health, smoke  │
│                        EAS: manual AAB                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## For collaborators (direct repo access)

### One-time setup

```bash
git clone https://github.com/rishabhrd09/vitaltrack.git
cd vitaltrack
```

### Daily flow

#### 1. Update `main`
```bash
git checkout main
git pull origin main
```

#### 2. Create a feature branch
```bash
git checkout -b feature/add-export-button
```

**Naming**

| Prefix | Use |
|---|---|
| `feature/` | new feature |
| `fix/` | bug fix |
| `hotfix/` | urgent prod fix |
| `docs/` | documentation |
| `refactor/` | code refactor |
| `test/` | test-only |
| `chore/` | maintenance |

#### 3. Make changes, commit in meaningful chunks
```bash
# edit, test
git add <specific files>
git commit -m "feat(inventory): add export button"
```

**Conventional Commits:**
```
<type>(<scope>): <short imperative>

type ∈ { feat, fix, docs, style, refactor, test, chore, perf, ci }
```

Examples:
- `feat(auth): add biometric login`
- `fix(items): handle negative quantity edge case`
- `refactor(mobile): extract api client`
- `docs: update deployment guide for Render`

Prefer many small commits over one big one — reviewers can jump between them.

#### 4. Push the branch
```bash
git push origin feature/add-export-button
```

#### 5. Open the PR

1. Browse to the repo on GitHub.
2. Click **Compare & pull request** (appears after push).
3. Fill in the template (below).
4. Assign reviewers.
5. Submit.

**Optional:** add the `build-apk` label. This triggers the CI job `build-preview` which runs `eas build --profile preview --platform android` and posts the APK link back to the PR — reviewers can sideload a real binary pointed at the staging backend.

#### 6. Wait for CI (3–5 min)

The important PR jobs run in parallel:

| Job | Does |
|---|---|
| `test-backend` | blocking pytest, Ruff, `/api/v1` route count 39, and item/order coverage gates (postgres:16 service) |
| `typecheck-backend-advisory` | mypy baseline, advisory until the existing type errors are fixed |
| `test-frontend` | blocking `tsc` and ESLint; `expo-doctor` runs advisory |
| `security-scan-advisory` | Trivy CRITICAL/HIGH baseline, advisory until vulnerable dependencies are upgraded |
| `pr-check` | Merge gate — succeeds only if backend + frontend pass |

The merge gate is `pr-check`; it requires the backend and frontend jobs. The advisory jobs should still be inspected, but they are not proof that mypy or Trivy are clean yet.

#### 7. Address review
```bash
# make requested changes
git add <files>
git commit -m "fix: address review"
git push origin feature/add-export-button
```

#### 8. Merge

Once approved + green:

1. **Squash and merge** (default) or **Merge** — both work. Use squash for tidy history; use merge when the commit-by-commit story matters.
2. Confirm.
3. Delete the branch (GitHub prompts).

#### 9. Clean up locally
```bash
git checkout main
git pull origin main
git branch -d feature/add-export-button
```

---

## After merge — what the platform does

1. **CI re-runs on `main`** (push trigger).
2. **`deploy-backend` job** POSTs to the Render deploy hook (secret `RENDER_DEPLOY_HOOK`).
   The hook URL targets the **production** service only — there is no `RENDER_DEPLOY_HOOK_STAGING` in CI.
3. **Render services pull the new image** depending on what changed:
   - `vitaltrack-api` (production) rebuilds on every merge — the CI hook always fires, AND its dashboard auto-deploy is on.
   - `vitaltrack-api-staging` rebuilds **only when `vitaltrack-backend/` files actually changed**. Staging's auto-deploy is gated by Render's Root Directory filter (set to `vitaltrack-backend` in the Render dashboard), so frontend-only PRs do not retrigger staging. See `docs/STAGING_DEPLOY_DIAGNOSIS.html` for the post-mortem that established this.
4. `docker-entrypoint.sh` runs `alembic upgrade head` on the rebuilt service's DB, then boots Gunicorn (which spawns 4 Uvicorn workers — the runtime is `gunicorn -k uvicorn.workers.UvicornWorker`).
5. Health check at `/health` must pass before traffic flips.
6. **No mobile build is triggered** by merge. Production AAB is manual:
   ```bash
   cd vitaltrack-mobile
   eas build --profile production --platform android
   eas submit --profile production --platform android
   ```
   The CI `build-production` job exists but is gated off (`if: false`) until Play Console production is live.

Full trigger taxonomy: repo-root `CAREKOSH_BUILD_DEPLOY_FLOW.html`.

### Backend platform migration PRs

A backend host move is a docs/config/deploy-surface change, not a normal
feature. Keep product behavior unchanged and review these surfaces explicitly:

| Surface | File / setting |
|---|---|
| Backend image/runtime | `vitaltrack-backend/Dockerfile`, `vitaltrack-backend/docker-entrypoint.sh` |
| Runtime env vars | `DATABASE_URL`, `SECRET_KEY`, `ENVIRONMENT`, `CORS_ORIGINS`, `REQUIRE_EMAIL_VERIFICATION`, `MAIL_PASSWORD`, `MAIL_FROM`, `FRONTEND_URL` |
| Render-specific config | `vitaltrack-backend/render.yaml` |
| CI deploy step | `.github/workflows/ci.yml` `deploy-backend` job |
| Mobile build URLs | `vitaltrack-mobile/eas.json` |
| Mobile URL guards | `vitaltrack-mobile/app.config.js` |
| Local convenience scripts | `vitaltrack-mobile/package.json` `start:staging` / `start:prod` |

GitHub secrets today are `RENDER_DEPLOY_HOOK` and `EXPO_TOKEN`. Keep
`EXPO_TOKEN` for EAS. Replace `RENDER_DEPLOY_HOOK` if the backend leaves
Render; examples include `SSH_HOST` / `SSH_USER` / `SSH_PRIVATE_KEY` for a VPS,
`FLY_API_TOKEN` for Fly.io, `RAILWAY_TOKEN` for Railway, or
`DIGITALOCEAN_ACCESS_TOKEN` for DigitalOcean.

Use the stable public API hostnames (`api.carekosh.com` and
`staging-api.carekosh.com`) for mobile builds and operator smoke tests. If
installed mobile builds point directly at a provider URL, a future platform
change requires an APK/AAB rebuild. With stable domains, the next host move can
usually be DNS-only.

---

## For fork contributors (external)

### One-time setup

1. **Fork** on GitHub (top-right).
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/vitaltrack.git
   cd vitaltrack
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/rishabhrd09/vitaltrack.git
   git remote -v
   # origin    https://github.com/YOUR-USERNAME/vitaltrack.git (fetch/push)
   # upstream  https://github.com/rishabhrd09/vitaltrack.git  (fetch/push)
   ```

### Contribution flow

```bash
# 1. Sync with upstream
git checkout main
git fetch upstream
git merge upstream/main
git push origin main

# 2. Feature branch
git checkout -b feature/my-contribution

# 3. Work, commit
git add . && git commit -m "feat: ..."

# 4. Push to your fork
git push origin feature/my-contribution

# 5. Open PR: original repo → "New pull request" → "compare across forks"
#    Select your fork + branch.

# 6. Keep PR fresh if main moves
git checkout feature/my-contribution
git fetch upstream
git rebase upstream/main
git push origin feature/my-contribution --force-with-lease
```

Prefer `--force-with-lease` over `--force` — it fails if someone else pushed to your branch in the meantime, preventing accidental overwrites.

---

## Troubleshooting

### Can't push to `origin`

| Error | Fix |
|---|---|
| `Permission denied` | Not a collaborator — use the fork workflow |
| `Updates were rejected` | Someone pushed to the branch since your last pull. `git pull --rebase origin <branch>`, then push |
| `Remote not found` | `git remote -v` to check; `git remote add origin <url>` if missing |

### Merge conflicts
```bash
git pull origin main           # pull latest main into feature branch
# resolve conflicts in editor
git add <resolved files>
git commit                     # or git rebase --continue if mid-rebase
git push
```

### Wrong branch

```bash
# Committed to main by accident
git log -1                                # grab commit hash
git checkout -b feature/x                 # create branch at current HEAD
git checkout main
git reset --hard HEAD~1                   # pop the commit off main
git checkout feature/x                    # your commit is here

# Forgot to branch before editing
git stash
git checkout -b new-branch
git stash pop
```

### Undo the last commit
```bash
# Keep changes staged
git reset --soft HEAD~1

# Keep changes unstaged
git reset HEAD~1

# Discard changes (destructive)
git reset --hard HEAD~1
```

### Branch is "N commits behind main"

Normal — every merge to `main` bumps every open branch's count. Rebase only if you have conflicts, not because of the number.

---

## Branch protection on `main`

| Rule | Purpose |
|---|---|
| Require PR | No direct pushes |
| Require CI pass | `pr-check` must be green |
| Require review | ≥1 approval from a code owner |
| No force push | History on `main` is sacred |

Exception: production hotfix. If prod is on fire and the fix is ≤20 surgical lines, you can push directly — open a retroactive PR + post-mortem within 24 h. See `CAREKOSH_DEPLOYMENT_STRATEGY.html` Strategy D.

---

## PR template

Paste this in the PR description:

```markdown
## Description
Brief description of changes.

## Type
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
- [ ] Tested locally (Docker + Expo Go)
- [ ] Added / updated tests
- [ ] All CI checks green

## Screenshots (if UI)
<!-- paste screenshots -->

## Checklist
- [ ] Self-review done
- [ ] Comments added for non-obvious code
- [ ] Documentation updated (repo-root docs or this folder)
```

If your PR needs a preview APK for hands-on review, add the `build-apk` label after opening.

---

## Common commands

### Daily use
```bash
git checkout main && git pull                    # update
git checkout -b feature/name                     # branch
git add <files> && git commit -m "type: msg"     # stage + commit
git push origin feature/name                     # push
git branch -d feature/name                       # delete local
git push origin --delete feature/name            # delete remote
```

### Viewing history
```bash
git log --oneline --graph                        # pretty tree
git log --follow -p -- <file>                    # file history
git show <sha>                                   # diff of one commit
git blame <file>                                 # who changed what
```

### Undoing
```bash
git checkout -- <file>                           # discard unstaged edit
git reset HEAD <file>                            # unstage
git reset --soft HEAD~1                          # undo last commit, keep staged
git reset --hard HEAD~1                          # destructive: undo + discard
git revert <sha>                                 # safe: new commit that reverses <sha>
```

### Stashing
```bash
git stash                                        # save WIP
git stash pop                                    # restore
git stash list                                   # see all
git stash apply stash@{0}                        # restore but keep in stash
```

### Fork sync
```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

---

## Quick reference

```
┌────────────────────────────────────────────────────────────┐
│                    CAREKOSH GIT QUICK REF                   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  NEW FEATURE:                                              │
│    git checkout main && git pull                           │
│    git checkout -b feature/name                            │
│    # edit/test                                             │
│    git add <files> && git commit -m "feat: …"              │
│    git push origin feature/name                            │
│    # open PR — add build-apk label if APK needed           │
│                                                            │
│  AFTER MERGE:                                              │
│    git checkout main && git pull                           │
│    git branch -d feature/name                              │
│                                                            │
│  SYNC FORK:                                                │
│    git fetch upstream                                      │
│    git checkout main && git merge upstream/main            │
│    git push origin main                                    │
│                                                            │
│  WRONG BRANCH:                                             │
│    git stash                                               │
│    git checkout correct-branch                             │
│    git stash pop                                           │
│                                                            │
│  CLEAN LAST COMMIT AFTER A HOOK FAIL:                      │
│    # NEVER amend — the hook blocked the commit,            │
│    # so amending would edit the PREVIOUS commit.           │
│    # Instead: fix the issue, re-stage, commit again.       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Best practices

1. **Small PRs.** Easier to review, faster to merge.
2. **One feature per PR.** Don't mix unrelated changes.
3. **Commit messages are durable.** "Future you" reads them during a 3 AM debug.
4. **Local test before push.** CI is a safety net, not a test suite.
5. **Update often.** Long-lived branches accumulate merge debt.
6. **Never force-push `main`.** Not even once.
7. **Don't `git push --no-verify`.** Hooks exist for a reason; if one fails, investigate the cause.

---

Questions? Comment on the PR or open a discussion on GitHub.

---

*Last reviewed 2026-05-04 against PR #34. The "After merge" section (§After merge) was corrected to reflect that staging only rebuilds on backend-file changes (Render Root Directory filter; see `docs/STAGING_DEPLOY_DIAGNOSIS.html` for the post-mortem) and that the runtime is `gunicorn -k uvicorn.workers.UvicornWorker` — gunicorn supervises Uvicorn workers.*
