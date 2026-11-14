## What does this PR do?

<!-- Describe your changes in 1-3 sentences -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / code cleanup
- [ ] Documentation
- [ ] CI/CD / infrastructure
- [ ] Other: ___

## Environments affected

- [ ] Backend (vitaltrack-backend/)
- [ ] Mobile app (vitaltrack-mobile/)
- [ ] CI/CD (.github/workflows/)
- [ ] Documentation (docs/)

## Testing

<!-- Describe how you tested this -->

- [ ] Backend tested locally with Docker or a disposable test database
- [ ] Mobile screens tested with Expo Go where supported (voice requires a native build)
- [ ] Native voice changes tested with an Android build on a device
- [ ] Preview APK tested on device
- [ ] curl commands verified
- [ ] Not applicable (docs/config only)

## Preview APK

> **Want a Preview APK built automatically?**
> On this feature branch's workflow, add the label `build-apk` to a PR targeting `main`.
> After the backend and mobile test jobs pass, CI queues an EAS build using `EXPO_TOKEN`.
> The job uses `--no-wait`: a successful job means the build was accepted, not that the APK compiled.
> The label stays active on later PR updates; remove it to stop requesting more builds.
> The current `preview` profile embeds `https://staging-api.carekosh.com`.
> Confirm the deployed service uses the staging database before device testing.
> EAS build availability and charges depend on your account's current plan and quota.

## Checklist

- [ ] My code follows the project's style (Ruff passes; mypy is advisory in CI and its baseline is not clean yet, so check that I added no new mypy errors)
- [ ] I have tested my changes locally
- [ ] I have not modified the production profile in eas.json
- [ ] I have updated documentation if needed
