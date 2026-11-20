# CareKosh

CareKosh helps family caregivers track home ICU supplies, spot low stock and apply received orders to inventory. A caregiver can edit an item in the browser and see the new quantity on Android after refreshing. Both clients write through the same FastAPI service, which stores the authoritative record in PostgreSQL. The repository and some directories still use the original name, VitalTrack.

## Start here

| What you need | What to open |
| --- | --- |
| Run the project for the first time | [Local quick start](docs/NEW_DEVELOPER_QUICKSTART.md). Choose the browser demo, the browser with a real local API, or Android. Finish by saving an item and reloading it. |
| Understand one change before editing | [Trace a stock edit](docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#stock-edit). Follow the Save button through the HTTP client, authentication, validation, database transaction and refreshed screen. The walkthrough links to each source file. |
| Get a fix reviewed, tested and released | [Change and release workflow](docs/GIT_WORKFLOW_GUIDE.md). Start from a fresh branch, follow the checks for the components you touched, and record the revision tested on staging. |
| Return after time away | [Deployment Atlas](docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#branches). Fetch the latest branches, compare the provider deployments with Git, and check which API and database each client uses before testing. |

After cloning, open the HTML guides in your browser. Their local links resolve inside the checkout.

## Where each environment runs

| Environment | Browser and Android | API and data |
| --- | --- | --- |
| Development | Vite on the laptop. Expo uses a laptop URL reachable from the phone. Browser demo mode keeps fictional data in browser storage. | API mode uses local FastAPI and the Compose PostgreSQL database. Automated backend tests use a separate disposable database. |
| Staging | `staging-app.carekosh.com` serves the web app. The Android `preview` profile targets staging. | `staging-api.carekosh.com` routes through Cloudflare to the staging Render service. Verify its Neon database identity before using test data. |
| Production | `homeicuinventory.carekosh.com` serves the web app. The Android `production` profile targets production, including on the Play internal track. | `api.carekosh.com` routes through Cloudflare to the production Render service and its configured Neon database. |

Cloudflare serves the browser assets. The browser calls the API hostname in its build. Render runs the Python application and selects the database through its private connection string. GitHub holds the code and workflows. The [Atlas system map](docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#map) shows how the services connect. Its [configuration guide](docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#keys) shows where each setting belongs.

## When you need more detail

- **System design and FastAPI.** Read the [backend book](interview/backendfastapi.html) with the [item handler](vitaltrack-backend/app/api/v1/items.py) open. Follow how a request gets a user and database session, how the transaction records the edit, and why two users of the same account can see a version conflict. Use the [authentication book](interview/authsecurity.html) for session handling.
- **Component work.** Start in the [web app](carekosh-web/), [Android app](vitaltrack-mobile/), [FastAPI backend](vitaltrack-backend/) or [public landing site](carekosh-site/). The [engineering library](docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#engineering-library) points to Docker, testing, architecture, voice and operator references by task.
- **Production operations.** Use the [release checklist](docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#change-guide) and [operations section](docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#operate) for deployment evidence and rollback. Historical audits and proposed designs are indexed in the [documentation library](docs/INDEX.html).

## License

All rights reserved.
