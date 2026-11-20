# CareKosh Android app

This Expo and React Native client lets a caregiver view stock, edit an item and manage orders through the CareKosh API. Start with the [local quick start](../docs/NEW_DEVELOPER_QUICKSTART.md) for Node.js, Metro, Expo Go and the connection to your laptop. The [USB guide](../docs/USB_ADB_REVERSE_GUIDE.md) covers phones that cannot reach the API over Wi-Fi.

## Trace a screen to the server

The [item editor](app/item/%5Bid%5D.tsx) holds the version the user opened. Its Save action calls a [mutation hook](hooks/useServerMutations.ts), then the [item service](services/items.ts) sends the request through the [HTTP client](services/api.ts). After an accepted write, affected queries fetch fresh data. A conflict requires loading the latest values before retrying.

The [query provider](providers/QueryProvider.tsx) persists eligible reads for quicker startup. The server owns inventory and decides whether a write succeeds. Check the [read hooks](hooks/useServerData.ts) when a refreshed screen shows an unexpected quantity. For a shared API change, repeat the same edit in the browser using the same environment and account. [Worked stock-edit example](../docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#stock-edit)

## Choose the correct backend

| Use case | How the destination is selected |
| --- | --- |
| Laptop development | Metro loads `EXPO_PUBLIC_API_URL`. Use the laptop’s LAN address from a phone, or `npm run start:local` with ADB reverse for port 8000. |
| Hosted staging | The EAS `preview` APK embeds `https://staging-api.carekosh.com`. Use a staging account. Custom native features such as the [voice module](modules/carekosh-voice/) require a compatible installed build. |
| Play release | The `production` AAB embeds `https://api.carekosh.com`. Play’s internal track distributes that build to testers with the production API already selected. |

Check the [EAS build and submit profiles](eas.json), [Expo configuration](app.config.js) and [npm scripts](package.json) when changing a target. Client configuration is public. Database credentials, origin verification and provider secrets belong on the server.

## Test and release

Run these from `vitaltrack-mobile/` after installing dependencies.

```sh
npx tsc --noEmit
npm run lint
npm test
```

A passing JavaScript test cannot exercise a handset microphone, device storage across restarts or the installed build’s network target. Verify the affected journey on a phone and record the APK or build version. [Mobile checks in CI](../.github/workflows/ci.yml) · [Staging acceptance](../carekosh-web/docs/STAGING_RELEASE_CHECKLIST.md)

For release work, the `build-apk` PR label can request an EAS preview build. The production AAB build and Play submission are separate operations. Use the tested checkout and confirm the selected build and track before submitting. [Change and release workflow](../docs/GIT_WORKFLOW_GUIDE.md) · [Android release and credentials](credentials/README.md) · [Atlas mobile release guide](../docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#mobile)
