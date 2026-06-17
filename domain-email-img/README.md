# Screenshots for CAREKOSH_DOMAIN_AND_EMAIL_GUIDE.html

Drop the setup screenshots here using these exact filenames. The guide
references each one at the step it belongs to; missing files show a labelled
placeholder instead, so the guide always reads correctly.

| Filename | Screenshot |
|---|---|
| `cloudflare-00-domain.png` | carekosh.com active in the Cloudflare dashboard |
| `github-01-secrets.png` | GitHub repo secrets: EXPO_TOKEN & RENDER_DEPLOY_HOOK |
| `brevo-01-authenticate-options.png` | Brevo "Authenticate carekosh.com" — the 3 choices |
| `brevo-02-authorize-records.png` | Brevo "Authorize DNS records" table |
| `brevo-03-verification-status.png` | Brevo record verification (syncing / mismatch then green) |
| `brevo-04-authenticated.png` | Brevo domain status "Authenticated" |
| `email-01-before-brevosend.png` | Email header from `…brevosend.com` (before) |
| `email-02-after-noreply.png` | Reset email from `noreply@carekosh.com` (after) |
| `cloudflare-01-routing-disabled.png` | Email Routing overview — Disabled / Not configured |
| `cloudflare-02-create-rule.png` | Create routing rule (support@ → Gmail) |
| `cloudflare-03-rules-list.png` | Routing rules list — support@ Active |
| `cloudflare-04-dns-records.png` | Settings → DNS records (MX / SPF / DKIM) |
| `cloudflare-05-routing-enabled.png` | Overview — Routing status Enabled |
| `cloudflare-06-activity-log.png` | Activity Log — message "Forwarded" |
| `email-03-support-received.png` | Test email to support@ arriving in Gmail |

PNG or JPG both work; if you use `.jpg`, update the matching `src` in the HTML.
