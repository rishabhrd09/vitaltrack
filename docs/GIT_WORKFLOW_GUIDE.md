# Git Workflow Guide

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

> **Status (re-checked 8 October 2026 against the working tree: `03cfebb` on `feature/backend-hardening-ai-voice-agent-foundation` plus uncommitted documentation).** That branch is **not merged**; `main` is still `835fad3`. Ruleset facts come from a GitHub API read on 7 Oct 2026 and were not re-checked on 8 Oct (NOT VERIFIED today): the `protect-main` ruleset required a pull request and blocked force-push and deletion, but required **0 approvals and no status checks**, so "green CI" and "approved" are team rules, not GitHub-enforced gates. Pushing a feature branch runs CI only when that branch has an open PR to `main` (a PR `synchronize` run); PRs to `main`, pushes to `main` and manual runs also start CI. Until this branch merges, a push to `main` runs `main`'s older workflow (Python 3.11, route gate 39, deploy hook called with `curl -s`, which cannot fail the job). Render deploy behaviour is NOT VERIFIED. Earlier note (23 Sept 2026): head `0007`, 152 backend tests — now out of date (head `0010` on the feature branch; re-run on 8 Oct 2026 against a disposable local PostgreSQL 16 database: 242 backend and 121 mobile tests passed). Current behaviour: [complete developer guide](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) · [documentation home](INDEX.html).

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
│   squash or merge      Render (see below)  curl /health, smoke  │
│                        EAS: manual AAB                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Step 3 alone triggers nothing: CI starts when the PR to `main` is opened (step 4), or by a manual `workflow_dispatch`. Once the PR is open, every push to its branch re-runs CI. Step 8 depends on Render dashboard settings that were not re-checked on 7 or 8 Oct 2026 (NOT VERIFIED); see [After merge](#after-merge--what-the-platform-does).

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

> **Until the feature branch merges (8 Oct 2026):** `main` (`835fad3`) has no `/api/v1/ai/*` routes, no `carekosh-voice` module and only migrations up to `0006`. If your change depends on the newer code, branch from `origin/feature/backend-hardening-ai-voice-agent-foundation` instead.

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

**Optional:** add the `build-apk` label. After both test jobs pass, the CI job `build-preview` runs `eas build --profile preview --platform android --non-interactive --no-wait` and posts a comment on the PR saying the build started; the APK itself is downloaded from the EAS dashboard (earlier text said the comment links the APK). A green job means EAS accepted the request, not that the APK built. Reviewers can then sideload a real binary pointed at the staging backend. The label stays on the PR, so every later push, reopen or label change queues another EAS build; remove it when you are done.

#### 6. Wait for CI (3–5 min)

The important PR jobs run in parallel:

| Job | Does |
|---|---|
| `test-backend` | fails the run on pytest, Ruff, exact `/api/v1` route count (`44` on the feature branch, `39` on `main`), and item/order coverage gates (postgres:16 service; Python 3.12, `3.11` on `main`) |
| `typecheck-backend-advisory` | mypy baseline, advisory until the existing type errors are fixed (23 errors in the 7 Oct 2026 run) |
| `test-frontend` | fails the run on `tsc` and ESLint errors (warnings pass); the feature branch also runs `npm test` and a voice-module autolinking check; `expo-doctor` output is suppressed (never fails) |
| `security-scan-advisory` | Trivy CRITICAL/HIGH baseline on PRs only, advisory until vulnerable dependencies are upgraded |
| `pr-check` | runs only on PRs, only if backend + frontend pass; it only prints a message |

`pr-check` is the team's merge signal; it runs only after the backend and frontend jobs pass. GitHub does not enforce it: the `protect-main` ruleset had no required status checks (API read on 7 Oct 2026; not re-checked since), so the merge button works even when CI is red. Check the run before merging. The advisory jobs should still be inspected, but they are not proof that mypy or Trivy are clean yet.

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

1. **CI re-runs on `main`** (push trigger), using the workflow file in the merged commit. Until this feature branch merges, that is `main`'s older file.
2. **`deploy-backend` job** calls the Render deploy hook URL with `curl --fail` (secret `RENDER_DEPLOY_HOOK`) after both test jobs pass; if the secret is not set, the step is skipped. Earlier text said "POSTs"; `curl` without `-X` sends a GET. A success response means Render started or queued a deploy of the latest commit on the service's linked branch (no `ref` is sent), not that the deploy succeeded. `main`'s older workflow uses `curl -s`, so there a failing hook call does not fail the job.
   `ci.yml` has no separate staging hook (no `RENDER_DEPLOY_HOOK_STAGING`). Which service the secret's URL points to is not visible in the repo; earlier docs say production (NOT VERIFIED).
3. **Render services rebuild the image** depending on what changed (as documented up to June 2026; live settings NOT VERIFIED):
   - `vitaltrack-api` (production) rebuilds on every merge — the CI hook fires when the secret is set, and its dashboard auto-deploy was reported on.
   - `vitaltrack-api-staging` rebuilds **only when `vitaltrack-backend/` files actually changed**. Staging's auto-deploy is gated by Render's Root Directory filter (set to `vitaltrack-backend` in the Render dashboard), so frontend-only PRs do not retrigger staging. See `docs/STAGING_DEPLOY_DIAGNOSIS.html` for the post-mortem that established this.
   - (7 Oct 2026, owner-reported, not independently verified) staging was switched to the feature branch `feature/backend-hardening-ai-voice-agent-foundation`. While that holds, merges to `main` do not redeploy staging.
4. `docker-entrypoint.sh` runs `alembic upgrade head` on the rebuilt service's DB, then boots Gunicorn with **2** Uvicorn workers (`--workers 2` in the Dockerfile `CMD`; earlier text said 4). The runtime is `gunicorn` with `--worker-class uvicorn.workers.UvicornWorker`. If the migration fails, the container exits and the new deploy does not start.
5. The health check path in `vitaltrack-backend/render.yaml` is `/live` (process liveness), not `/health`; `/health` also probes the database and is for readiness checks and smoke tests. Whether the live services use that file, and their dashboard health-check paths, are NOT VERIFIED.
6. **No mobile build is triggered** by merge. Production AAB is manual:
   ```bash
   cd vitaltrack-mobile
   eas build --profile production --platform android
   eas submit --profile production --platform android
   ```
   `eas submit` uses `submit.production` in `eas.json`: the Play **internal** track and a service-account key at `vitaltrack-mobile/credentials/google-service-account.json` (git-ignored, not in the repo). A production-profile AAB calls `https://api.carekosh.com` on every Play track; the EAS profile, not the track, fixes the API URL.
   The CI `build-production` job exists but is disabled (`if: false`; the workflow comment says it was turned off during the server-first refactor).

Full trigger taxonomy: repo-root `CAREKOSH_BUILD_DEPLOY_FLOW.html`.

### Backend platform migration PRs

A backend host move is a docs/config/deploy-surface change, not a normal
feature. Keep product behavior unchanged and review these surfaces explicitly:

| Surface | File / setting |
|---|---|
| Backend image/runtime | `vitaltrack-backend/Dockerfile`, `vitaltrack-backend/docker-entrypoint.sh` |
| Runtime env vars | `DATABASE_URL`, `SECRET_KEY`, `ENVIRONMENT`, `CORS_ORIGINS`, `REQUIRE_EMAIL_VERIFICATION`, `MAIL_PASSWORD`, `MAIL_FROM`, `FRONTEND_URL`, plus `SENTRY_DSN` and any `AI_*` / `GROQ_API_KEY` settings in use |
| Render-specific config | `vitaltrack-backend/render.yaml` |
| CI deploy step | `.github/workflows/ci.yml` `deploy-backend` job |
| Mobile build URLs | `vitaltrack-mobile/eas.json` |
| Mobile URL guards | `vitaltrack-mobile/app.config.js` |
| Local convenience scripts | `vitaltrack-mobile/package.json` `start:staging` / `start:prod` |

`ci.yml` references two secrets, `RENDER_DEPLOY_HOOK` and `EXPO_TOKEN` (whether both are set, and at repository or environment level, is NOT VERIFIED). Keep
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

# 3. Work, commit (stage explicit paths; `git add .` also stages untracked local files)
git add <files> && git commit -m "feat: ..."

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

GitHub does not pass repository secrets to workflows triggered by pull requests from forks, so the `build-apk` label cannot start an EAS build for a fork PR (the job has no `EXPO_TOKEN`). A maintainer has to build the preview APK instead.

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
git push origin <your-branch>  # name the branch explicitly
```

### Wrong branch

```bash
# Committed to main by accident
git log -1                                # grab commit hash
git checkout -b feature/x                 # create branch at current HEAD
git checkout main
git reset --keep HEAD~1                   # pop the commit off main; --keep refuses
                                          # rather than discard uncommitted edits
git checkout feature/x                    # your commit is here

# Forgot to branch before editing
git stash
git checkout -b new-branch
git stash pop
```

### Undo the last commit

Only for commits you have not pushed; for a pushed commit use `git revert <sha>`.
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

| Rule | Purpose | Enforced by GitHub? (API read 7 Oct 2026; not re-checked 8 Oct) |
|---|---|---|
| Require PR | No direct pushes | Yes — ruleset `protect-main` (active, no bypass actors) |
| Require CI pass | `pr-check` must be green | **No** — the ruleset has no required status checks; team rule only |
| Require review | ≥1 approval from a code owner | **No** — the ruleset requires 0 approvals; `.github/CODEOWNERS` only requests @rishabhrd09 as reviewer |
| No force push | History on `main` is sacred | Yes — non-fast-forward pushes are blocked |
| No branch deletion | `main` cannot be deleted | Yes |

There was no classic branch protection on `main` (the API returned 404 on 7 Oct 2026); the rules above come from the repository ruleset.

Exception: production hotfix. Earlier text allowed a direct push for a ≤20-line fix. Under the ruleset as read on 7 Oct (no bypass actors) a direct push to `main` is rejected, so open a PR instead — it needs 0 approvals and can be merged at once — and write the post-mortem within 24 h. See the "Direct push to main" row and the rollback section of `CAREKOSH_DEPLOYMENT_STRATEGY.html` (earlier text pointed to a "Strategy D" section that no longer exists).

---

## PR template

GitHub pre-fills new PRs from [`.github/pull_request_template.md`](../.github/pull_request_template.md), which is the template to follow (it adds "Environments affected" and a Preview APK note). The block below is an older, shorter version kept for reference:

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

If your PR needs a preview APK for hands-on review, add the `build-apk` label after opening. Voice changes always need a native build: Expo Go cannot load the `carekosh-voice` module.

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

*Re-checked 2026-10-07 (`ci.yml` at `03cfebb`, GitHub API): route count 44 on the feature branch; `pr-check` and approvals are not enforced by the ruleset; deploy hook is a `curl` call; 2 Gunicorn workers (not 4); Render health check is `/live`; direct hotfix pushes are blocked by the ruleset; fork PRs get no secrets. Render dashboard behaviour not re-checked.*

*Re-checked 2026-10-08 against the working tree (`03cfebb` plus uncommitted documentation) and `git diff main HEAD` for `ci.yml`: added the `synchronize` rule, `main`'s older workflow (Python 3.11, gate 39, `curl -s`), the sticky `build-apk` label, explicit staging and pushes, `reset --keep`, and the missing "Strategy D" link. The ruleset reading is still the 7 Oct one; Render, EAS and GitHub settings were not re-checked.*
