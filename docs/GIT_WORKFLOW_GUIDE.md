# Take one change from a branch to production

Use this workflow for an inventory fix, a UI change or a change to the shared API. Keep the PR link, tested commit and deployment results together so someone returning later can reconstruct what shipped.

## Start a change

From a clean checkout, fetch the current remote and create a short-lived branch. This example starts a stock-edit fix from the latest fetched main.

```sh
git fetch origin
git switch --no-track -c fix/stock-edit origin/main
```

Reproduce the issue with a fictional item in the [local setup](NEW_DEVELOPER_QUICKSTART.md). Identify which client sends the request and which layer owns the behavior. For a quantity edit, follow the [screen, handler and transaction](deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#stock-edit). Add a regression test at the layer that failed. If a shared response changes, test both clients.

## Select the checks for the change

| Changed area | Local and CI checks |
| --- | --- |
| FastAPI or database | Use Python 3.12 and the services, dependencies and test environment in [backend CI](../.github/workflows/ci.yml). Run Ruff and pytest from `vitaltrack-backend/`. CI tests both a model-built schema and an Alembic-built schema. The fixtures rebuild tables, so use a disposable local test DB and memory rate-limit storage. For a migration, also test upgrading representative existing data and review rollback compatibility. |
| Browser or public site | From `carekosh-web/`, use Node.js 24, `npm ci` and `npm run check`. [Web CI](../.github/workflows/carekosh-web.yml) also runs browser tests, verifies both environment builds, checks the landing site and exercises hosting behavior. Demo mode is useful for UI changes. Use API mode for sign-in, stock persistence or permissions. |
| Android | In `vitaltrack-mobile/`, install dependencies and run `npm test`, `npx tsc --noEmit` and `npm run lint`. Exercise the affected screen on a phone. For native modules, test the installed APK. The optional `build-apk` PR label requests a staging preview build using EAS credentials. |
| Documentation only | Check changed instructions against their source files. Run `python3 docs/tools/check_docs.py --strict` from the root. Open changed HTML from a clean checkout and follow its links. For interview-book changes also use the [book builder and verifier](../interview/src/). |

Push your branch and open a PR to `main`. Use the [PR template](../.github/pull_request_template.md) to record what changed, affected environments and verification results. Contributors using a fork push there and open the PR against this repository’s `main`. Wait for applicable checks on the final revision and resolve failures before merging. The backend/mobile workflow runs for PRs to main. Web checks are path-filtered.

## Verify staging and release the tested revision

1. **Check what merging can trigger.** Before using a merge-first release, verify that the production Worker’s connected Git build ends in a Wrangler dry run, Render’s native auto-deploy is off and the GitHub Render hook job is disabled (`ENABLE_RENDER_AUTO_DEPLOY` must not be `true`). If an automatic production path is active, validate the candidate on staging **before** merging and coordinate the release. The [Atlas release section](deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#release) explains the independent triggers.
2. **Identify the candidate.** After the reviewed merge, record the resulting `main` SHA. The documented staging branch is `feature/backend-hardening-ai-voice-agent-foundation`. Check the linked branch in both staging services before advancing it. Fast-forward staging to the chosen commit. If Git reports divergence, inspect the staging-only commits before reconciling. The [branch guide](deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#branches) distinguishes Git history from deployed versions.
3. **Check the staging deployment.** In Cloudflare, record the staging Worker version and its build source. In Render, record the staging API’s Live commit. Confirm the staging API and database are selected. On the relevant staging clients, sign in with a controlled account and replay the original failure. For a stock edit, save 8, reload and verify 8 on the other client if affected. Record the result in the PR. [Hosted acceptance checklist](../carekosh-web/docs/STAGING_RELEASE_CHECKLIST.md)
4. **Promote the components that changed.** For the web app, run [Release CareKosh web](../.github/workflows/release-carekosh-web.yml) on main only while it points to the SHA tested on staging. If main moved, test the new revision first. For the API, select the tested commit on production Render. For Android, build the signed production AAB from the tested checkout and verify it on the Play internal track before rollout. Its embedded URL already points at production. Ship a compatible API first when clients depend on a new contract. [Android profiles](../vitaltrack-mobile/eas.json)
5. **Close the release.** Record the Worker version, Render SHA or Android build/version code, the previous working version, the environment returned by API health, and the result of checking the changed journey. For a schema change, record the Alembic revision and recovery plan. Reverting an application build does not reverse a database migration. [Operations and rollback](deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#operate)

For a pure documentation change, run PR checks normally. When suppressing a deployment, put `[skip ci]` first and `[skip render]` in the **final squash commit message**. Confirm the Worker build was skipped and check Render Events and GitHub Actions for the resulting SHA. Leave skip markers off the PR head so it receives CI.

## Returning after a break

Fetch the remote again. These read-only commands show the main revision, the staging branch revision and how many commits each has that the other lacks.

```sh
git fetch origin
git rev-parse origin/main
git rev-parse origin/feature/backend-hardening-ai-voice-agent-foundation
git rev-list --left-right --count origin/main...origin/feature/backend-hardening-ai-voice-agent-foundation
```

A result of `0 0` means the Git tips match. Next compare them with **Cloudflare Deployments**, **Render Deploys**, the database’s **Alembic current** revision and the **Play track/build** for the component you will change. Use the source and environment built into the artifact to identify what users actually run.
