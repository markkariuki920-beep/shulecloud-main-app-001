# ShuleCloud implementation checkpoint

This checkpoint was prepared from the provided project ZIP. It does not claim that production integrations or live school workflows have been tested.

## Changes in this checkpoint

- Added a school-scoped local attendance queue for offline saves, duplicate student/date merging, account ownership checks, and explicit manual sync when the connection returns.
- Added automated unit tests for the offline attendance queue.
- Added CSV and print actions for school fee balances and payment history.
- Added a Super Admin integration panel for protected M-Pesa Daraja and SMS settings, connection/test actions, enable/disable controls, and queued-SMS processing.
- Added a Super Admin backup panel with manual backup execution, verification status/history, and signed downloads.
- Added a token-protected Daraja STK callback endpoint that validates callback token, transaction reference, environment, receipt and amount before applying the existing idempotent payment completion function.
- Added a cron-protected scheduled task endpoint for subscription reminders, queued SMS processing, and daily backup attempts (requires the host scheduler and secrets).
- Added tests for M-Pesa callback parsing and status mapping.
- Hardened callback handling so malformed callbacks without a result code are rejected and Safaricom is only acknowledged after the database completion RPC succeeds.
- Added a follow-up database migration that validates invoice fee items belong to the invoice school and prevents financial records being reassigned to a different school/student.
- Expanded `.env.example` to document required server-only Supabase, Super Admin, encryption, and scheduler secrets.
- Replaced the starter README with ShuleCloud-specific local setup, integration configuration, scheduler setup, and launch verification instructions.
- Added unit tests for backup format and row-count verification.
- Added CSV export for report-card results.
- Added `.env.example` with placeholders and removed the original `.env` from the distributable project to avoid shipping environment values.

## Existing features found in the project

The codebase already contains StaffManager, academic/exam/marks/report-card components, fee and payment screens, M-Pesa Daraja functions, SMS provider functions, backup functions, integration settings and database migrations. Their presence is not proof of end-to-end production readiness.

## Still requires verification or external setup

- Run `npm install`, `npm test`, `npm run lint`, and `npm run build` in the target environment. Dependency installation timed out in this environment, so tests/build have not been executed.
- Apply the checked-in migrations in numeric order as documented in `SUPABASE_SETUP.md`; finance integrity is in `0004_finance_integrity.sql`. Then verify invoice creation and finance workflows against a disposable database.
- Test attendance queue/sync against the actual Supabase policies with real test accounts and connectivity changes.
- Configure and test the authorized Super Admin account and school accounts.
- Verify `/api/public/mpesa/callback/{token}` against Safaricom sandbox callbacks and verify `/api/public/cron/shulecloud` from the configured scheduler.
- Enter Daraja and SMS provider credentials in the protected integration settings, test sandbox flows, and complete provider production approval.
- Configure the host scheduler to call `/api/public/cron/shulecloud` with `Authorization: Bearer $SHULECLOUD_CRON_SECRET`; verify the private storage bucket, retention, restore procedure and scheduled execution in deployment.
- Confirm offline data persistence and service-worker caching behavior across browser restarts; this checkpoint queues attendance only and does not claim full offline support for all application data.
- Complete end-to-end checks against a non-production database before launch.

## Important security note

Do not commit `.env`, real API credentials, database service-role keys, or encryption secrets. If any private credentials were shared outside a trusted environment, rotate them.
- Follow-up review: invoice validation now evaluates invoice-only fields only for invoices and rejects class-specific fees applied to students outside the fee item's class. This SQL change still needs execution against a disposable Supabase database.
- Added a dependency-free `npm run preflight` check for required source files, migration sequence, environment-template keys, and registration of the M-Pesa/cron routes. It passed 25/25 checks in this environment. This static check does not replace test, lint, type-check, build, or live integration runs.
- Added a CI workflow that installs the committed Bun lockfile and runs static preflight, TypeScript, unit tests, lint, and production build on pushes and pull requests. Added `npm run typecheck` / `bun run typecheck` (`tsc --noEmit`) to make the type-check command explicit. The workflow is committed as configuration only; it has not run in this environment because Bun and project dependencies are unavailable here.

- Added a static SQL migration audit that checks every table declaration in the checked-in migrations for an explicit RLS enablement statement and verifies selected finance/M-Pesa protections. This is a source-level safeguard only; it does not prove the live database policies are correct.

- Hardened backup-file verification to validate supported format version, parseable creation timestamp, table row-list shape, row object shape, and safe non-negative expected row counts. Added tests for unsupported versions, malformed timestamps, invalid rows, and invalid expected counts. These tests are added but still need to run after dependencies are installed.

- Added migration `0005_mpesa_amount_verification.sql`: a successful Daraja status query without a verified paid amount is sent to Super Admin review instead of automatically extending a subscription. This migration must be applied in order and tested against a disposable Supabase project.
