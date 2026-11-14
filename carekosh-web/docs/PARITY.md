# Android to web parity

The Android source, including current uncommitted application changes, was treated as the product reference. No Android source or native assets were edited. The browser is a standalone React implementation in `carekosh-web`, sharing copied pure business rules and the original brand imagery.

| Workflow | Web result | Notes |
| --- | --- | --- |
| Dashboard counts and critical backup rules | Implemented | Counts derive from account inventory; no hardcoded production metrics. |
| Inventory all/category views | Implemented | Search, category/status filters, sorting, collapsible categories, persistent URL filters. |
| Item create/edit/delete | Implemented | Quantities, minimum, units, brand, notes, supplier, URL, expiry reference, critical marker. Editable values and their update/delete version stay pinned to the same snapshot. A newer background fetch cannot authorize an older edit; conflicts retain the edits until an explicit confirmed reload. Description/notes/purchase-link limits match the API at 1,000/1,000/500 characters. |
| Builder | Implemented | Category creation/deletion, per-category workspace, selection/bulk deletion, missing catalog suggestions, Add Defaults, replace-all, Start Fresh. Default categories protected by catalog name. |
| Catalog | Reused | Android's 10 categories and 32 items; displayed totals derive from catalog data. |
| Destructive changes | Browser adapted | Confirmation, backup download, version/updated-time checks, operation guards, partial-failure reporting. Multi-request operations are not atomic. Browser download initiation cannot prove the user retained the backup file. |
| Regular/emergency order cart | Implemented | Emergency means active critical equipment with quantity ≤ 1; ordinary out-of-stock items stay in regular review. Existing-cart keep/merge/replace choices, manual-quantity preservation, bulk removal, editable suggestions, totals, and fresh server review. Minimum-less quantities require manual entry; unit changes require re-adding the line. |
| Save order | Implemented | Save without immediate export. Explicit confirmation and visible check/save progress; stable localId and unchanged retry payload. Unknown attempts stay locked after retry rejection. Stale confirmations and late responses cannot replace another cart. Successful saves remain reprintable. No purchase is placed. |
| Orders / lifecycle | Implemented | History, details, timeline, valid state actions, received separate from apply, already-applied guard, deletion. No invented partial-receipt quantities. |
| CareKosh typed queries | Reused / adapted | Android pure parsers, selection engine, validation, ambiguity handling, scoped queries and draft preparation. Questions produce facts from loaded inventory. No direct stock mutation. |
| Online Coach understanding | Integrated, provider unverified | Capability/version checks and explicit consent before existing v3 interpretation endpoint. No paid provider call made during development. |
| Voice | Android only by product decision | Desktop and mobile web use typed Ask CareKosh. No microphone, dictation, browser read-aloud or speech API integration is exposed. Android voice features are unchanged. |
| Item photos | API limitation surfaced | Existing accessible HTTPS images display/print; no durable upload endpoint exists. No fake image storage. |
| Inventory JSON | Implemented | Browser file download; inventory/categories export remains separate from full workspace backup. |
| Inventory/order PDF | Browser adapted | Escaped printable HTML; browser Print / Save as PDF, optional existing photos, repeated headers. Popup failure is visible; no duplicate order on reprint. |
| Backup / restore | Backup implemented | Loaded inventory, categories, saved orders, and latest 100 activities. No restore/import UI is invented. |
| Registration / login / refresh / logout | Implemented and locally tested | Additive cookie transport; same mobile account store. In-memory access token, cross-tab coordination, no live data storage. |
| Verification / reset / change password | Integrated | Backend HTML links retained; web forms use existing endpoints. Real email delivery remains a staging test. |
| Profile / deletion request | Implemented | Editable fields match backend; email displayed read-only; request email, cancellation, and server confirmation distinction retained. |
| Appearance / help / search | Implemented | Two themes, keyboard search, focus-managed dialogs, mobile navigation, support and account routes. |
| Offline state | Implemented | Last loaded data labelled; real mutations blocked; no offline write queue or service-worker cache. |
| Hosting | Prepared and locally validated | Cloudflare static assets, environment guards, explicit deep-link rewrites, real asset 404s, headers, CI, release/rollback documentation. |

## Deliberate browser differences

Latest review: Android commit `08e292e`, checked 25 October 2026. Dashboard critical-item detail, emergency-cart recovery, bulk removal, order statuses, and retry behavior are aligned. Typed Coach parser/query changes were already present in the web code. See [VERIFICATION.md](VERIFICATION.md) for the focused test results and real local account flow.

Desktop uses a sidebar, tables, a wider order cart, and a profile workspace. Narrow screens use bottom navigation and stacked layouts. Status text accompanies color. The brand's charcoal/blue identity is preserved with adjusted contrast, spacing, and typography.

Web unsaved drafts and uncertain submission records are in memory; keep the tab open while resolving an uncertain save. This avoids persisting live account data in browser storage. Loaded data is cleared on account changes. Existing Android HTTP token response contracts remain unchanged.
