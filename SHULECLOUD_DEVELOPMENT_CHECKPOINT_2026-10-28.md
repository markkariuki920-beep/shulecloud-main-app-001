# ShuleCloud development checkpoint — 28 October 2026

This checkpoint consolidates work across checklist items 1–9. It describes source-code changes and static checks only; it does not claim that live accounts, provider credentials, production database policies, or the full application test suite have been verified.

## 1. Dashboards and role routing

- The dashboard route automatically resolves the signed-in user's available roles and sends Super Admin, school admin, teacher, bursar, parent, and unapproved applicants to the corresponding view. Users with multiple school workspaces can switch workspaces after sign-in.
- School admin, teacher, and bursar screens expose role-appropriate sections. Database row-level security remains the real authorization boundary.
- Visual matching against the approved screenshots remains unverified because those reference screenshots are not included in this project workspace.

## 2. Offline support

- Static shell/assets are cacheable; academic lists, class student lists, and saved marks use a school-and-user-scoped browser cache. Attendance and exam marks have offline queues.
- Offline mark queueing now rejects missing identifiers and invalid negative/non-finite scores. When syncing, the app re-checks that the exam is unlocked, the score is within the current maximum, and the student still belongs to the queued class. Invalid/stale rows remain queued instead of being silently discarded.
- Fees, payments, roles, invitations, subscriptions and provider credentials are intentionally not queued offline. Offline access is not claimed for every screen.

## 3. School Google Drive backups

- School admins can connect Google Drive, choose daily/every-three-days/weekly/manual schedules, run a manual backup, view status, and open the latest verified Drive file.
- Upload uses the resumable Google Drive API for larger JSON exports. ShuleCloud downloads the uploaded file and compares it with the generated payload before marking success. The latest file ID, name and URL are stored by the new migration `0011_school_drive_backup_file_metadata.sql`.
- Scheduled backup candidates are ordered oldest/never-run first and processed in bounded batches.
- This checkpoint does not implement a one-click restore into a live school database. Restore must be validated in a disposable database and follow a reviewed recovery procedure.

## 4. Invitations and notifications

- Invitation email is sent server-side through Resend after re-checking the caller's school-admin role and an active matching invitation. Delivery still requires a verified sender and private provider configuration. SMS delivery is not live-verified.

## 5. M-Pesa and subscriptions

- Existing safeguards validate subscription amount bounds, constrain production callback origins, cap callback bodies, and protect against duplicate callback processing. A saved checkout reference is required for callbacks to match a transaction.
- Daraja sandbox scenarios and subscription lifecycle still need end-to-end tests with real sandbox credentials.

## 6. Scheduled jobs and database safeguards

- Scheduled maintenance uses a database lease. Migration `0012_single_platform_backup.sql` adds a unique partial index that blocks concurrent platform backup runs, closing the race between simultaneous manual requests.
- Apply migrations `0000` through `0012` in journal order on a disposable Supabase project first. Verify cron scheduling, SMS retries, reminders and backups after deployment.

## 7–9. Production readiness, migrations and error handling

- Google Drive OAuth error redirects use the configured HTTPS `APP_URL`, not the incoming request host. `APP_URL` must be the published HTTPS origin without a path/query/fragment.
- Preflight and static migration audits include the new Drive metadata and backup concurrency safeguards.
- Private credentials remain outside the source ZIP; set provider keys only in private deployment secrets.

## Checks run in this environment

- `npm run preflight`: 62/62 checks passed.
- `npm run security-audit`: 47/47 checks passed.
- TypeScript syntax transpile: 111 `.ts`/`.tsx` files, zero syntax diagnostics.
- `npm install --ignore-scripts --no-audit --no-fund` timed out. Dependencies were not installed, so the full unit test suite, TypeScript type-check, lint and production build could not be run.

## Required before production

1. Finish screenshot-by-screenshot dashboard review.
2. Install locked dependencies and pass tests, type-check, lint and production build.
3. Apply migrations to a test Supabase project and test tenant isolation using separate accounts from two schools.
4. Configure Google OAuth, email, Daraja and SMS credentials, then test provider success and failure paths.
5. Test actual backup downloads and restoration into a disposable database before planning production recovery.
