# ShuleCloud offline and Google Drive backup implementation notes

## Offline behavior added in this checkpoint

- The production service worker caches the public app shell, the client-rendered dashboard shell, and versioned same-origin static assets. It never caches API requests, authentication pages, or mutation requests.
- Academic lists, class student lists, and marks query results are cached locally under both the school ID and the signed-in user ID. This prevents an offline cache from showing one account's cached academic data to another account on the same device.
- Attendance keeps its existing offline queue. Exam marks now have a separate per-school/per-user queue. The app validates score bounds before queueing and checks the current exam lock and maximum score before syncing. Queue items that fail validation are kept for review rather than silently discarded.
- Fees, payments, role changes, invitations, subscription actions, and credentials are deliberately not queued offline because replaying those actions without server confirmation could create financial or authorization inconsistencies.
- Offline mode requires the user to have signed in previously and opened the relevant class/academic data while online. It is not a claim that every screen or every data type is fully usable without internet.

## Google Drive school backups

1. Apply `drizzle/migrations/0009_school_google_drive_backups.sql` after migrations `0000` through `0008`.
2. In Google Cloud Console, create an OAuth 2.0 **Web application** client. Add `https://YOUR-PUBLISHED-DOMAIN/api/public/google-drive/callback` as an authorized redirect URI.
3. Set these private server environment variables (never `VITE_` variables):
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`
   - `APP_URL` (published HTTPS origin, without a trailing slash)
   - `INTEGRATIONS_ENCRYPTION_KEY` (existing stable secret used to encrypt the stored refresh token)
4. Publish the app, sign in as the school admin, open **Backups**, connect the intended Google account, select a frequency, enable automatic backups, and save.
5. The protected hourly cron endpoint checks enabled school schedules. A manual backup is available even when the frequency is set to Manual only.

Each file is a school-scoped JSON export stored in a `ShuleCloud-Backup-{SchoolName}` Drive folder. The server stores the refresh token encrypted, uses a signed short-lived OAuth state, and compares the uploaded file's downloaded content before reporting success. The export excludes platform-wide settings and provider credentials. It includes school records such as students, academics, attendance, fees, invoices, payments, staff assignments/invitations, parent links, and school subscription/payment records.

## Validation status and launch blockers

- `node scripts/preflight.mjs`: passed in the editing environment.
- `node scripts/security-audit.mjs`: passed in the editing environment.
- TypeScript syntax transpilation: passed for the source files.
- Full `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` could not be completed here because project dependencies were not installed and the dependency installation did not finish.
- Google OAuth, Drive upload/verification, scheduled backups, Supabase RLS, and backup restore have not been live-tested. Those require the target Supabase migration to be applied, a deployed HTTPS origin, and real Google OAuth credentials. Test against a disposable school before relying on backups for production records.


## Backup file handling and recovery boundary

- Google Drive backups use the resumable upload API so large school exports are not limited to small multipart uploads. ShuleCloud downloads the uploaded file and compares its contents before marking it successful.
- The latest verified Drive file ID, filename and Drive URL are stored for the school admin to open. Reconnecting Google Drive or changing the schedule preserves those metadata fields.
- Automatic backup scheduling processes the oldest/never-run schedules first in bounded batches so a school beyond the first 100 records is not starved.
- Backups are JSON exports, not a one-click production restore. Recovery must first be tested against a disposable Supabase database; do not import a backup into a live school database without a reviewed restore procedure and a fresh pre-restore backup.
- OAuth failure redirects use the configured `APP_URL`, not the incoming request host. Configure `APP_URL` as the HTTPS origin only (for example `https://school.example`, with no path).
