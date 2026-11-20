## Change

<!-- What user-visible behavior or developer instruction changes? For a fix, describe how to reproduce it. -->

## Affected components

- [ ] FastAPI / database
- [ ] Browser app / public site
- [ ] Android
- [ ] CI / deployment configuration
- [ ] Documentation

## Verification

<!-- Record the local commands or user journey you exercised and the result. For a shared API change, cover both clients. For docs, check the instructions and links after cloning. -->

## Release record

<!-- For a release, add the candidate SHA, staging deployment or build ID, and result of the changed journey. On promotion, add the production version, smoke result and previous working version. For docs-only work, state whether a deployment is intended. -->

For a staging Android APK, the optional `build-apk` label requests an EAS preview build after the backend and mobile tests pass. The CI job exits when EAS accepts the request. Check the EAS build result and test the installed APK. Remove the label to avoid requesting another build on subsequent PR updates.
