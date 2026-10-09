# CareKosh system design pages

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](../docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

Four standalone pages that explain CareKosh end to end. The independent content and diagram review
finished on 8 October 2026, against branch `feature/backend-hardening-ai-voice-agent-foundation`
at `03cfebb` (not merged; the local `main` reference is `835fad3`). The full application test
results quoted in the pages are from the earlier 7 October audit.

Read [TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md) for the corrections, source evidence,
fresh checks and limits. These pages describe the feature implementation; they do not certify
the code deployed to a live service or installed on a phone.

| Page | For |
|---|---|
| [01_system_overview_and_api_flows.html](01_system_overview_and_api_flows.html) | The whole system, its technology and deployment, the backend, and every API flow from the tap to PostgreSQL and back |
| [02_backend_fastapi_interview_guide.html](02_backend_fastapi_interview_guide.html) | Every backend concept in depth, plus a Python and FastAPI interview question bank |
| [03_developer_onboarding_guide.html](03_developer_onboarding_guide.html) | Setting up, making a change, testing and pushing it safely |
| [04_environments_and_deployment.html](04_environments_and_deployment.html) | Environments, configuration, CI/CD, migrations, releases and operations |

Open any page straight from disk in a browser. Fonts come from Google Fonts; without a connection the pages fall back to local serif and monospace fonts.

## Reading the diagrams

Colours mean the same thing in every diagram and on every page:

| Colour | Meaning |
|---|---|
| Olive | The phone app |
| Slate | The FastAPI backend |
| Ochre | PostgreSQL, caches and storage |
| Plum | Outside services (Brevo, Groq, Sentry) |
| Brick | Failures, refusals and risks |
| Taupe | Platform: hosting, CI and tooling |
| Maroon | Step numbers and the main path |

A dashed outline means "only when configured". Numbered badges follow the order of events.

Every diagram has an **Enlarge** button (or click the diagram) that opens a full-screen view with zoom steps, and an **Open the SVG** link.
On a phone, a diagram keeps a readable size and scrolls sideways inside its frame.

## Folder layout

```text
carekosh_system_design/
├── 01_…04_*.html          the four pages (diagrams are inlined by build_pages.py)
├── assets/carekosh.css    shared design system: colours, type, layout, components
├── assets/carekosh.js     chapter list, copy buttons, the Enlarge view, scroll highlight
├── diagrams/*.svg         standalone diagrams (used by "Open the SVG")
├── TECHNICAL_REVIEW.md    independent corrections, evidence and verification limits
├── verification/         reproducible review probes and dated result snapshots
└── src/
    ├── paperkit.py        drawing toolkit: canvas, cards, arrows, notes, swim-lane flows
    ├── fontmetrics.py     character widths measured in Chrome, so text wraps inside its card
    ├── build_diagrams.py  one function per diagram
    ├── build_pages.py     inlines the diagrams into the pages and adds the figure tools
    └── check_guides.py    scoped offline links, markup and diagram consistency checks
```

## Rebuilding

From the repository root:

```bash
python3 carekosh_system_design/src/build_diagrams.py
python3 carekosh_system_design/src/build_pages.py
python3 carekosh_system_design/src/check_guides.py
python3 docs/tools/check_docs.py --strict
```

- `build_diagrams.py` writes every SVG into `diagrams/`. Pass names to rebuild only some, for example `build_diagrams.py auth-session voice-flow`.
- `build_pages.py` replaces each figure's diagram with the current SVG, so run it after any diagram change. It is safe to run repeatedly.
- Both scripts use only the Python standard library. They read nothing outside this folder and touch no database or service.
- `check_guides.py` explicitly checks this folder's pages, Markdown links, SVG references and inline-diagram consistency. The repository-wide checker's fixed `CURRENT` list does not include these four pages, so its `--strict` result alone does not gate them.

## Changing or adding content

- **A diagram:** edit or add a function decorated with `@diagram("name")` in `src/build_diagrams.py`. Use the roles above (`client`, `server`, `data`, `service`, `fail`, `platform`) so the colours keep their meaning.
- **A figure on a page:** add
  `<figure class="diagram"><div class="frame wide"><img src="diagrams/NAME.svg" alt="…"></div><figcaption><b>Figure N.</b> …</figcaption></figure>`
  and run `build_pages.py`, which swaps the image for the inline SVG.
- **A new page:** copy the shortest page, `04_environments_and_deployment.html`, keep its head, top bar, layout and footer, and replace the content. Add the page to the top bar of every page and to `TITLE_WORD` in `src/build_pages.py`.
- **Facts:** take them from the code first, then from [API traceability](../docs/API_TRACEABILITY.md) and the documentation audit (local review reference; not published). Mark anything about live services, dashboards or installed apps as not verified.
- **Security:** the repository is public. Describe rate limiting only as best effort with an open finding tracked privately, and use synthetic examples only.
