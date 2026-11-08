# ShuleCloud roadmap (spec: SHULECLOUD HYBRID V3.0)

## Current request — branding, authentication, and deployment cleanup
- [x] Replace branding with the owner's exact uploaded logo and matching favicon; preserve existing design.
- [x] Diagnose email/password and Google sign-in, verify hosted settings, and preserve accounts and role routing.
- [x] Remove safe optional telemetry and obsolete images; document essential remaining platform ties.
- [x] Review and correct independent deployment instructions without migrating or resetting the database.
- [x] Existing tests 42/42, lint 0 errors (7 warnings), static audits passed; automatic build OK. Standalone production/typecheck commands not manually run.
- [x] Remove hosted-builder authentication: Google sign-in now uses Supabase Auth directly; cloud-auth-js package, generated wrapper, and managed Google provider removed (4 Nov 2026).
- [ ] Owner configures own Google OAuth client ID/secret in Auth settings, then Google flow can be verified — blocked on owner's Google Cloud credentials.
- [ ] Complete valid password/Google and five-role authenticated checks — blocked on owner sign-in and Google credential setup.
- [ ] Complete independent deployment — blocked by private server credential portability; remaining build and logo asset serving changes require destination verification. See INDEPENDENCE_REVIEW.md.

- [x] Phase 1–3 foundation: tenant tables + RLS, sign-in (email, Google), single Super Admin via protected email, school applications, approval → school + 5-day trial, trial extension/suspension with audit log
- [x] Phase 4a: academic years, terms, classes, subjects, students
- [x] Phase 4b: staff invites/roles (bursar, teacher)
- [x] Phase 5: exams, marks, grading, attendance, report cards
- [x] Phase 6: finance — fee structures, invoices, payments, receipts
- [x] Phase 7 implementation: M-Pesa Daraja STK push and token-protected callback endpoint wired to idempotent completion (sandbox verification still required)
- [x] Phase 8: parent dashboard + child linking
- [x] Move project into the managed cloud environment with a new managed database (same 2 database scripts, unchanged)
- [x] Phase 10: subscription screens connected to School Admin + Super Admin dashboards; database rules verified (24 checks)
- [x] Live click-through of both subscription screens (test school submitted a payment code; Super Admin rejected it; school saw the reason)
- [x] Super Admin email is configured through the private `SUPER_ADMIN_EMAIL` server environment variable (never hardcoded in source); deployment owner must set it in Cloudflare.
- [x] Owner account signed in and confirmed as Super Admin (dashboard shows Platform overview)
- [x] Phase 9 partial: school-scoped offline attendance queue + explicit sync + queue tests (needs live Supabase/offline verification)
- [x] Phase 11a UI partial: Super Admin M-Pesa/SMS settings, connection test, enable/disable and queue-processing controls (live use needs provider credentials; automatic scheduled SMS processing still requires a deployed scheduler)
- [x] Phase 11a scheduled task endpoint: reminder enqueueing and queued SMS processing (requires host scheduler and provider credentials)
- [ ] Phase 11a: Verify SMS settings and queue against configured provider credentials and confirm scheduled runs in deployment
- [x] Phase 11b partial: Super Admin manual backup panel, verification history and signed downloads added; backup runner includes checksum/row-count verification and retention.
- [x] Phase 11b scheduled task attempts daily verified backups; first scheduled-path backup ran and verified
- [x] Phase 11b: restore button built and tested live (Google Drive still needs credentials)
- [x] Phase 11c partial: fee balances/payments CSV + print, report-card CSV + print (verify in browser)
- [ ] Phase 12: full testing + deployment checklist (requires dependency install, build/tests, live test accounts and external service configuration)
- [x] Finance integrity follow-up: validate invoice fee item school and class match; migration execution and negative-case verification still required.


## Payment verification hardening
- [x] Require a verified paid amount before automatic subscription extension on M-Pesa success.
- [x] Migrations 0000–0006 applied in order to the then-managed database (finance integrity, M-Pesa amount check, school archiving incl. archive-flag protection)
- [ ] Test M-Pesa callback/query resolution with Daraja sandbox credentials

## Stage 13 (moved to a new managed cloud environment)
- [x] Project imported, Cloud database created, all migrations applied, Google + email sign-in on, private backup storage created, encryption key generated
- [x] Type check, lint, unit tests clean; fixed cache-key clash between School setup / Exams / Staff lists
- [x] Live click-through done with test accounts: application → approval → setup → staff invite → teacher accepts → marks → charts → archive (owner locked out, database refuses edits) → restore; test school left archived. Fixed: terms/students could not be saved (same-school check)
- [ ] Email notification for staff invitations — waiting on owner's email domain setup, then add the invite email
- [x] Hourly managed schedule (minute 17) calls /api/public/cron/shulecloud; manual run verified: reminders OK, SMS off, backup success + verified

## Stage 14 (new hosted-builder account, Oct 2026)
- [x] Project code imported from local ZIP; packages installed; new empty managed cloud database connected
- [x] Imported database scripts 0000→0007 applied successfully, with 0008 recording setup completion; 27 RLS-enabled tables confirmed. Do not rerun.
- [x] Email/password and Google sign-in re-enabled; hosted settings verified, email confirmation retained.
- [x] Read `SUPER_ADMIN_EMAIL` from private server environment; verify the signed-in user against Supabase Auth before the one-time protected claim.
- [ ] Create private backup bucket + encryption key, re-create hourly schedule.
- [ ] Then: restore-from-backup button, invite emails (needs email domain), Daraja/SMS credentials, end-to-end retest

## Current continuation (28 October 2026)
- [x] Preserve the existing project/database and applied migrations; no reimport or rebuild.
- [x] Existing automated tests: 23/23 passed; static database security checks: 36/36 passed.
- [x] Targeted dashboard/schema check: academic and finance columns present, school_status exists as a computed SQL field, bearer middleware registered; latest automatic build reports build OK.
- [x] Lint now has zero errors (six existing component-export warnings); generated Cloud files left untouched.
- [x] Public sign-in page renders, dashboard redirects signed-out visitors to sign-in, and browser reports no page errors. Full signed-in flow remains unverified.
- [ ] Authenticated dashboard checks: no accounts or schools exist in this backend yet; owner sign-in is required.
- [ ] Current backend setup remains incomplete: INTEGRATIONS_ENCRYPTION_KEY absent; no backup bucket or hourly schedule. Restore-from-backup is not implemented. Invitation emails need a verified email domain; M-Pesa/SMS testing needs provider credentials.

## Stage 15 (moved into the then-current hosted project, 29 Oct 2026)
- [x] Code imported from ShuleCloud-fixed-auth-and-review-2.zip; new empty managed cloud database connected
- [x] Database set up from two scripts (foundation + combined follow-up equal to old 0001–0013); do not rerun old files
- [x] Email/password + Google sign-in code paths use Supabase Auth; private environment variables and platform-backups storage require deployment-owner configuration/verification
- [x] Type check, lint (0 errors), 31/31 unit tests, preflight 64/64, security audit 51/51, production build OK
- [x] Live database permission test (30 checks, rolled back): school isolation, five roles, duplicate payment/receipt guards, revenue, archiving
- [x] Owner signed in as Super Admin with Google (confirmed by owner, 29 Oct 2026)
- [ ] Old records/users: need export from the previous project (blocked: owner)
- [ ] Hourly schedule for /api/public/cron/shulecloud (after publish)
- [ ] M-Pesa Daraja sandbox, SMS provider, Google Drive (GOOGLE_DRIVE_CLIENT_ID/SECRET, APP_URL), invite emails (email domain or RESEND_API_KEY/EMAIL_FROM) — blocked on credentials
- [x] Restore-from-backup button on Super Admin backups list (safety backup first, all-or-nothing, live test: price change reverted)
