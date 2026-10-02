
## Self-serve SaaS launch
- [x] Phase 0 implementation note
- [x] Public signup + automatic organization (owner, Free plan)
- [x] Plans & limits enforced server-side; existing orgs on protected legacy plan
- [x] Odoo / Docsie / PDF-import gated by plan
- [x] Manual visibility (indexed / unlisted / private), HTML-first public page, QR code
- [x] Homepage messaging, /pricing, /terms, /privacy (legal drafts), Plan & billing page
- [x] Stripe checkout, portal, webhooks (live keys; real-card test pending)
- [x] Super-admin plan override UI
- [x] Seat limit check at invite creation
- [x] Marketing pages: how-it-works, examples, features, faq, help, contact, guides
- [x] sitemap.xml / robots.txt (public-indexed manuals only)
- [x] Onboarding checklist + feedback button + post-publish question
- [x] Privacy-conscious manual view counts + master-admin feedback inbox
- [x] Final launch report (MANUMANUALS_SELF_SERVE_LAUNCH_REPORT.md)

## App UX redesign (Build → Review → Publish)
- [x] App shell: grouped sidebar, account menu, breadcrumb
- [x] Manuals dashboard: library, filters, status chips, compact onboarding
- [x] Manual workspace Build/Review/Publish modes
- [x] MANUMANUALS_APP_UX_REDIRECTION_REPORT.md

## Signup / checkout
- [x] Paid plan from Pricing should say "Continue to checkout", not "Try it free"
- [x] Signup email: desotod@gmail.com already existed (no email sent by design); signup now says so
- [x] Reset link signed users in: /auth/reset was nested under the sign-in page, which redirected signed-in users to Manuals. Separated.
- [ ] Owner: test full new-account → checkout flow with a fresh email (ThumperFab demo org is on Legacy/unlimited by design)
