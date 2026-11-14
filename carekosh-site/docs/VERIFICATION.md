# Local verification

## P3 review — 27 October 2026

Recaptured `assets/app-coach.jpg` from the current light-theme demo after fixing singular/plural count units. The actual 710×988 app screenshot uses fictional records. Production, staging and local static checks passed. Documentation now consistently calls the assistant **Ask CareKosh**. No deployment or hosted settings changed. See the [complete local review](../../docs/CAREKOSH_P3_REVIEW_AND_NEXT_STEPS.txt) for backend/web changes, Android compatibility results and remaining release work.

The following sections retain the earlier 25 October verification history; their running-preview statements describe that session.

## Screenshot refresh after the typography and navigation updates

Replaced all six marketing captures with fresh screenshots of the real local demo: light and dark dashboards (1440×1400), Inventory, Orders and Ask CareKosh (710×988), and the phone dashboard (390×844). The default dashboard and all feature/phone previews use the light theme. The phone, Inventory and Orders captures include the latest Dashboard / Inventory / Orders / Ask CareKosh bottom navigation. Ask CareKosh shows an actual stock-summary response from fictional demo data.

The phone frame now follows the screenshot's aspect ratio; its caption flows underneath, keeping all four navigation labels clear. Updated the overview and phone alt text and the phone caption to describe the current screenshots. A development-only framing helper in `carekosh-web/scripts/screenshot-preview.html` documents repeatable capture sizes; it does not modify the app UI or its production entry.

Verified the refreshed gallery, light/dark switching, screenshot enlargement and Escape dismissal in the local browser. Checked 320, 390, 768, 1024 and 1440px layouts with no horizontal document overflow; visually checked the phone frame and navigation at narrow mobile widths. JPEG dimensions match the HTML attributes. `npm run check` passed for production, staging and local static builds, and the local preview server syntax check passed. See [the updated phone showcase](latest-mobile-navigation-preview.png).

No deployment, DNS changes, backend/Android changes, real account creation or production-data writes were performed.

## Final typography and responsive pass

The landing page passed a further review at 320, 390, 768, 1024, and 1440px with no horizontal document overflow. Reviewed the hero, navigation, feature cards, How It Works, FAQs, final call to action, and footer. Mobile navigation, feature switching, expanded FAQs, and local registration/sign-in/demo-dashboard navigation were exercised. The existing page typography and spacing remained consistent, so no extra visual overrides were added.

The local review helper now includes the laptop breakpoint, fits its preview to the available height, and rechecks layout after content changes. `npm run check` passed for all three static build targets, and the preview server syntax check passed. No deployment or real account creation took place. The full app review and mobile-navigation fixes are recorded in [web verification](../../carekosh-web/docs/VERIFICATION.md).

The public homepage was built and reviewed locally at `http://127.0.0.1:5175/`. No hosting or DNS changes were performed.

Earlier branding revision: all primary app previews were recaptured in the light theme, with the updated emergency dashboard and larger Ask CareKosh icon. Light is the default; the dark dashboard is optional. The CareKosh header/footer mark was enlarged, including mobile sizes. Screenshots use correctly served JPEG assets with matching dimensions. Production, staging and local build checks passed after the changes. Landing layouts passed at 320, 390, 768 and 1440px; mobile navigation, feature tabs and screenshot enlargement were exercised. See [the earlier light showcase](light-theme-showcase.jpg).

Security headers were strengthened and included in build assertions. The shared CI workflow now checks this site as well as the web app. Operational requirements and remaining release gates are documented in [SECURITY_AND_SCALE.md](../../carekosh-web/docs/SECURITY_AND_SCALE.md); no DNS, edge or backend security configuration was changed here.

## Automated checks

- `npm run check` passed for production, staging and local builds: correct app CTA origins, existing assets and local fonts, valid fragment targets, unique IDs, metadata and no local/staging URL leakage into production.
- `node --check scripts/preview.mjs` passed.
- Local preview server returned HTTP 200 and noindex for its responsive review helper.

## Browser checks

- Real iframe viewport widths of 320, 390, 768 and 1440px reported document widths equal to viewport widths, with no horizontal overflow.
- Mobile menu opened and exposed the navigation and account links.
- Get Started navigated to the existing local app's `/register` page with the Create account screen.
- Sign In navigated to the existing local app's `/login` page with the Welcome back screen.
- Inventory/Orders/Ask CareKosh tabs updated their screenshot and selected state. ArrowDown moved from Orders to Ask CareKosh and focused the selected tab.
- Light/dark dashboard controls changed the screenshot and pressed state. Screenshot enlargement opened a modal; Escape closed it and restored focus.
- The Android-account FAQ expanded and displayed its answer.
- Main page and phone layouts were visually inspected with real app screenshots using fictional sample data.

## Scope and remaining release work

These checks cover the static landing page and local navigation. They do not assert that production or hosted staging is live, that real signup/email delivery works, or that the existing app's backend has passed hosted acceptance. Complete the app's separate staging release checklist before launch. Review the apex site's existing legal pages, routes and headers before integrating this homepage.

The public website remains separate from the web application. The screenshot refresh added only a development framing helper to the web project; it did not change Android, API or web application behavior, create accounts, or alter production data.
