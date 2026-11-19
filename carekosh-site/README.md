# CareKosh — Home ICU Inventory: public website

Your home care supplies, organized.

A standalone, static public landing page prepared for `https://carekosh.com`. It introduces the product and links to the separate web application. No backend calls, authentication, analytics, cookies, forms, external fonts or new dependencies are included. Images show the real local web app with fictional demo inventory. The existing Android app and API are not modified by this project.

## Local preview

Run with the installed Node.js runtime (Node 24 tested):

```sh
cd carekosh-site
npm run dev
```

Open `http://127.0.0.1:5175/`. Keep the separate CareKosh app demo running on port 5174. Local Get Started buttons go to `http://127.0.0.1:5174/register`; Sign In buttons go to `/login` on that same app. Demo authentication does not create real accounts or send emails. The preview rebuilds when source files change; reload the browser to see updates.

For responsive review, open `http://127.0.0.1:5175/__preview`. Its controls render the page inside real 320, 390, 768, 1024 and 1440px viewports. This development helper is not included in any build. See `docs/VERIFICATION.md` for the checks performed.

## Builds and verification

```sh
npm run check
npm run build
```

| Build | Output | App links | Canonical site |
| --- | --- | --- | --- |
| Local preview | `dist-local/` | `http://127.0.0.1:5174` | `http://127.0.0.1:5175` |
| `npm run build:staging` | `dist-staging/` | `https://staging-app.carekosh.com` | `https://staging.carekosh.com` (proposed, not provisioned) |
| `npm run build` | `dist/` | `https://homeicuinventory.carekosh.com` | `https://carekosh.com` |

Production Get Started and Sign In links are absolute, so they also lead to the canonical app when the landing page is served from `www.carekosh.com`. The preview address bar is generated from the selected environment's app address. At narrow widths the address can wrap without hiding the screenshot control.

`npm run check` checks JavaScript syntax and all three static builds: CTA destinations, local assets, fragment links, fonts, duplicate IDs, metadata and environment separation. Production contains no local app links. All assets are local; production includes a sitemap, robots.txt and static security headers. Staging and local builds are noindex. Non-hashed assets revalidate rather than receiving immutable caching.

## Source and content

- `src/index.html`: server-readable content, metadata and CTA placeholders.
- `src/styles.css`: responsive layout and reduced-motion support.
- `src/site.js`: mobile navigation, screenshot light/dark switch, accessible feature tabs and screenshot enlargement. FAQs use native details/summary.
- `assets/`: original CareKosh logo, local Inter fonts/license, and fresh JPEG captures of the real local demo. Dashboard, inventory, orders, Coach and phone previews use the light theme by default; dark dashboard remains an optional switch. Captures dated 25 October 2026 include the latest typography, spacing, emergency panel, and four-button mobile navigation (Dashboard, Inventory, Orders, Ask CareKosh).
- `scripts/build.mjs`: explicit environment substitution and static output.
- `scripts/preview.mjs`: loopback-only local preview; unknown routes return real 404s.

Copy describes implemented inventory, order, export and typed Coach functionality. No invented testimonials, usage counts, pricing, clinical claims, or store availability claims are used. Product figures (32 starter items, 10 categories) describe the current catalog, not customer usage.

### Refreshing the screenshots

With the local demo app running on port 5174, open `/scripts/screenshot-preview.html?view=desktop&screen=dashboard` on that origin. The development-only helper frames the real app at the existing asset dimensions: `desktop` is 1440×1400, `portrait` is 710×988, and `phone` is 390×844. `screen` supports `dashboard`, `inventory`, and `orders`; open Ask CareKosh from the app and request a stock summary for its portrait capture. Capture the iframe rectangle after the helper reports that fonts are ready, then encode as JPEG at quality 92 using the existing asset filenames. Capture both dashboard themes and restore Light afterward. Use fictional demo data only. The helper is outside the app's production entry and is not bundled into the deployed app.

Keep the screenshot dimensions and HTML width/height attributes in sync. The phone frame follows the image's natural aspect ratio, and its caption sits below the phone so that all four navigation labels remain visible.

## Deployment is deferred

Security ownership, implemented frontend controls, scaling boundaries and mandatory release gates are recorded in [the security and growth foundation](../carekosh-web/docs/SECURITY_AND_SCALE.md). Passing static checks does not verify edge/DNS or backend abuse controls.

No Site registration, cloud publishing, domain association or DNS change is part of this work. No automatic deploy command is included.

Before publishing, inspect which existing Cloudflare service owns `carekosh.com` and `www`. Deploy the new homepage/assets through that site's reviewed release process, preserving existing privacy-policy, account-deletion, email-related and other public paths. Do not replace the entire apex site's output with this standalone directory unless those routes have first been retained. Existing local policy drafts under `future_plan/legal` have not been approved or silently copied into this build. Add verified public policy links to the footer as part of the release review.

The generated `_headers`, `robots.txt`, `sitemap.xml` and `404.html` describe this standalone site. Merge them with the existing site's configuration during release review; do not overwrite existing routing or apply this page's restrictive CSP to unrelated pages without checking their requirements.

The proposed public-site staging hostname is `staging.carekosh.com`; provision/confirm it before using that build as a hosted preview. Keep its app links pointed at the independently tested staging web app. Complete the web app's hosted staging acceptance first; see `../carekosh-web/docs/DEPLOYMENT.md` and `../carekosh-web/docs/STAGING_RELEASE_CHECKLIST.md`.

The apex website and `homeicuinventory.carekosh.com` remain separate artifacts. Publishing the landing page should not redeploy the API, change Android build settings, or alter existing API, mail, MX, SPF, DKIM or DMARC records. The root repository's main-branch backend deployment hook still needs its normal release controls when merging any change.

The optional `www.homeicuinventory.carekosh.com` app alias should redirect to `homeicuinventory.carekosh.com`, preserving path and query string. That needs a later reviewed Cloudflare DNS/TLS and edge-redirect setup. Do not redirect the whole public website to the app or add public-site/redirect-only origins to the API allowlists. Nothing in this local build provisions either `www` hostname.
