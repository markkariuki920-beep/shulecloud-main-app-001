> Superseded by `SHULECLOUD_DEVELOPMENT_CHECKPOINT_2026-10-28.md`, which consolidates checklist items 1–9 and records the latest code changes and verification limitations.

# ShuleCloud feature, integration and production-readiness checkpoint

This checkpoint covers items 4–7: invitation/notification delivery, subscription/M-Pesa hardening, scheduled jobs/database safeguards, and production-readiness controls. It is a source-code checkpoint, not a claim that live services have been tested.

## 4. Staff invitations and notifications

- School staff invitations remain created by the database `invite_school_staff` function. Acceptance still requires signing in with the matching verified email and accepting from the dashboard.
- Added optional server-side Resend email delivery. The sending function independently checks the caller's school-admin role and looks up a matching active invitation before sending. It escapes HTML content and does not expose the Resend API key to browser code.
- Configure private `RESEND_API_KEY`, `EMAIL_FROM`, and the published HTTPS `APP_URL`. `EMAIL_FROM` must be a sender/domain verified with Resend. If not configured, the invitation remains valid and the UI clearly tells the admin email delivery was not sent; the invitee can still sign in to see it.
- SMS remains opt-in and must be tested in the selected provider's sandbox/test mode before production. Provider acceptance is not proof of delivery to a handset.

## 5. Subscription and M-Pesa safeguards

- Subscription amount is checked as a positive safe integer and bounded before the STK request is made.
- Failure to persist Safaricom's checkout reference now fails the recorded transaction rather than reporting a successful prompt setup that the callback cannot match.
- Production M-Pesa configuration requires the callback base URL origin to exactly match the configured published HTTPS `APP_URL`.
- M-Pesa callback bodies are capped at 64 KiB before parsing. Callback tokens are checked in constant time; unknown and already-processed callbacks do not mutate payment records.
- The SQL completion function enforces one-time completion, duplicate receipt protection and routes missing/mismatched paid amounts to review. Do not enable production until Daraja sandbox success, cancellation, timeout, duplicate callback, missing amount and amount mismatch scenarios are tested.

## 6. Scheduled jobs and database safeguards

- Added migration `0010_scheduled_job_locks.sql` with RLS enabled and service-role-only access. Atomic lease RPCs stop overlapping hourly cron requests from running the same maintenance batch concurrently. The lock expires if a worker crashes, and release requires the original lease token.
- Apply migration `0010` after `0009` before deploying the updated cron route. The Drizzle migration journal has been updated.
- The cron endpoint requires the private `SHULECLOUD_CRON_SECRET`, returns a skipped response if another run owns the lease, and releases the lease in a `finally` path.
- Verify the hosting scheduler invokes `POST /api/public/cron/shulecloud` with `Authorization: Bearer <SHULECLOUD_CRON_SECRET>`. Confirm reminder deduplication, SMS retries, daily platform backup, school Drive backup schedules, and backup restore against a disposable school/database.
- The lease protects scheduled maintenance. Manual backups and provider callbacks still need concurrent live testing and operational monitoring.

## 7. Production-readiness controls

Before launch:

1. Set private server environment variables in the hosting provider, not in `VITE_` variables or committed files.
2. Apply all journaled migrations in order, including `0009` and `0010`, and confirm RLS/policies on the live Supabase project.
3. Create separate accounts for Super Admin, school admin, teacher, bursar and parent; test access from two separate schools to verify tenant isolation.
4. Test email verification, password reset, invite expiry/cancel/accept, role changes, subscription expiry/suspension, marks locking, fee receipts, and parent links.
5. Test Daraja and SMS sandbox behavior; inspect failed/duplicate callbacks and retry queues. Only switch providers to production after approved credentials and end-to-end tests.
6. Test Google OAuth, backup upload/download verification, scheduled backup, token revocation, failed backup alerts and actual restore. A successful upload alone is not a restore test.
7. Run `npm ci` (or the project's supported locked install command), `npm run preflight`, `npm run security-audit`, `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` in CI. Resolve all failures before deployment.
8. Configure HTTPS, domain/redirect allowlists, database backups, log monitoring, rate limits at the hosting edge, and a rollback/recovery plan.

## Current limitations

No credentials were supplied and no live provider or production database was accessed. Email delivery, Daraja, SMS, Google OAuth, scheduler execution, RLS behavior and restore are therefore not live-verified. Dependency-backed tests/typecheck/lint/build must still be run in an environment where the locked dependencies can be installed.
