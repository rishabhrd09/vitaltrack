# HTML review evidence — 8 October 2026

These are documentation-review checks on feature commit `03cfebb`. They are separate from the
full application tests recorded in the [7 October audit](../../docs/documentation-audit-2026-10-07/VERIFICATION.md).

| Evidence | Scope |
|---|---|
| [request-probe.json](request-probe.json) | Three actual FastAPI request probes with a fake session; route and model metadata. No database connection or provider call. |
| [browser-qa.json](browser-qa.json) | 22 SVGs, 1,157 text elements, four pages, 35 Enlarge/Close controls. No reported geometry, page-overflow, anchor, duplicate-ID or JavaScript errors. |
| [document-checks.json](document-checks.json) | Dedicated scoped guide checker; zero problems. |
| [repository-doc-checks.txt](repository-doc-checks.txt) | Repository checker result. Its `--strict` allowlist alone does not gate these four pages. |
| [change-boundary.json](change-boundary.json) | 145 runtime-file hashes unchanged; 26 generated outputs unchanged by another build; branch and HEAD recorded. Native/app change boundary also checked through Git. |

From the repository root, structural verification needs only Python's standard library:

```bash
python3 carekosh_system_design/src/check_guides.py
```

The [request probe](request_probe.py) needs Python 3.12 and the backend's pinned requirements.
Activate an existing appropriate virtual environment, then run from the repository root:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$PWD/vitaltrack-backend" \
python carekosh_system_design/verification/request_probe.py
```

The probe explicitly disables real mail, provider keys, AI feature flags and Sentry. Its database
URL points to an unused loopback port, and the relevant session dependency is replaced with a fake.
It creates no synthetic rows in any database.

The [browser driver](browser_qa.cjs) needs Node and Playwright with its Chromium browser installed
in an isolated tooling environment; no runtime dependency was added to the app. Set
`CAREKOSH_PLAYWRIGHT_MODULE` to that environment's Playwright module path if Node cannot resolve it.
It writes screenshots and a fresh JSON report into a newly created temporary directory:

```bash
node carekosh_system_design/verification/browser_qa.cjs
```

Web fonts may be fetched from Google Fonts. No app, database, AI, email or deployment endpoint is
contacted by this browser check. Geometry checks detect intersecting text and text outside the SVG
canvas; visual inspection remains necessary for arrow routing and meaning. These tools do not
automatically verify conceptual correctness of prose.
