# ShuleCloud — Supabase setup and connection checklist

This guide connects the existing ShuleCloud source to **your own Supabase project**. It does not create a project or connect it automatically; those steps require access to your Supabase account.

## 1. Create or choose a project

1. Sign in to the Supabase dashboard and create a new project for ShuleCloud (or select the intended test project).
2. Save the database password somewhere safe. Do not put it in the app's `.env.local` or commit it to source control.
3. Open **Project Settings → API** (the exact menu label may vary).
4. Copy the project URL and the **publishable** key. The browser app must never receive a `service_role` or secret key.
5. Use a disposable/test project first. Do not test migrations against a live school's data.

## 2. Configure local environment

Copy `.env.example` to `.env.local` and replace the placeholders. Use the same project URL and publishable key for both the server and browser entries:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_REF
SUPABASE_PROJECT_ID=YOUR_PROJECT_REF
SUPER_ADMIN_EMAIL=the authorised Super Admin email
SUPABASE_SERVICE_ROLE_KEY=YOUR_PRIVATE_SERVICE_ROLE_KEY
INTEGRATIONS_ENCRYPTION_KEY=YOUR_LONG_RANDOM_PRIVATE_SECRET
SHULECLOUD_CRON_SECRET=A_DIFFERENT_LONG_RANDOM_PRIVATE_SECRET
```

- Keep `.env.local` private; never upload it with a ZIP or commit it to Git.
- `SUPABASE_SERVICE_ROLE_KEY`, `INTEGRATIONS_ENCRYPTION_KEY`, and `SHULECLOUD_CRON_SECRET` are server-only. **Never prefix them with `VITE_`.**
- Generate different strong random values for the encryption and cron secrets. Back up the encryption key securely; changing it without migrating stored encrypted settings can make existing integration credentials unreadable.
- For deployment, add these values in the host's private environment/secrets settings and redeploy. Do not rely on a local `.env.local` for the deployed site.

## 3. Apply database migrations in order

The SQL files in `drizzle/migrations/` are the database setup source of truth for this ZIP. In Supabase, open **SQL Editor** and apply each file below once, in this exact order, using a test project first:

1. `drizzle/migrations/0000_shulecloud_foundation.sql`
2. `drizzle/migrations/0001_shulecloud_subscriptions_integrations_finance_archiving.sql`
3. `drizzle/migrations/0002_backup_restore.sql`
4. `drizzle/migrations/0003_bursar_reads_classes_terms.sql`
5. `drizzle/migrations/0004_parent_reads_grade_bands.sql`
6. `drizzle/migrations/0005_class_teacher_assignments.sql`
7. `drizzle/migrations/0006_apply_imported_shulecloud_schema.sql`

Migration `0006` adds a database comment and is intentionally small, but apply it in order so the migration journal matches this release. If migrations `0000`–`0005` have already been applied to the existing ShuleCloud Supabase project, apply **only** `0006_apply_imported_shulecloud_schema.sql`, once. Do not reset the database or rerun earlier migrations. If you are unsure which migrations have already run, inspect the database before applying anything.

Stop at the first SQL error. Do not skip a failed migration or run later migrations on top of a partially created schema. Save the exact error and investigate it before continuing. Back up the database before applying changes to any non-empty production project. The migration files are not safe to rerun blindly as a batch against an existing database.

## 4. Configure authentication

1. In Supabase **Authentication → URL Configuration**, set the local development URL (for example `http://localhost:3000`) and the real deployed site URL. Add only the exact callback/redirect URLs used by the deployed app to the allowed redirect list.
2. In **Authentication → Providers**, enable the sign-in method the current ShuleCloud login screen uses and configure email confirmation as intended.
3. Create/sign in with `the authorised Super Admin email` and complete the provider's email-verification process. The server checks the configured email and then verifies the authenticated user against Supabase Auth’s authoritative user record, including `email_confirmed_at`, before granting Super Admin. It grants the role only if no different account already holds it. If this address is not the account you control, change `SUPER_ADMIN_EMAIL` in the private environment settings before first claim; the email in this example is configuration, not proof of identity.
4. Keep that email inbox secure. Do not manually grant Super Admin to multiple accounts. Test with a separate non-admin account too.

### Email confirmation and password-reset redirect (important)

For the production site, use `https://shulecloud.pages.dev` as the Supabase **Site URL** (or your own verified ShuleCloud domain). Add these exact URLs under **Authentication → URL Configuration → Redirect URLs**:

- `https://shulecloud.pages.dev/auth`
- `https://shulecloud.pages.dev/reset-password`

The app sends the current ShuleCloud origin as `emailRedirectTo` during registration and `redirectTo` during password reset. In **Authentication → Email Templates → Confirm signup**, keep the action link as `{{ .ConfirmationURL }}`; do not paste an old editor-project URL into the template. For password recovery, use the Supabase recovery confirmation URL in the same way. If an email still opens an old editor/project URL, check the Site URL and custom email templates in Supabase; changing app code alone cannot override a hardcoded URL in a Supabase email template.

After changing the URL configuration or templates, request a brand-new confirmation email and test that link. Previously sent emails can contain the old redirect destination.

## 5. Verify the database objects (read-only checks)

After all migrations succeed, run this query in SQL Editor. It only reads metadata and does not modify data:

```sql
-- Expected: every listed application table reports row_security = true.
select n.nspname as schema_name,
       c.relname as table_name,
       c.relrowsecurity as row_security_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles', 'schools', 'user_roles', 'school_applications', 'audit_logs',
    'students', 'classes', 'subjects', 'staff_invitations', 'teacher_assignments',
    'exams', 'exam_marks', 'attendance', 'fee_items', 'invoices', 'payments',
    'mpesa_transactions', 'sms_messages', 'backup_runs'
  )
order by c.relname;

-- Expected: key RPC functions exist.
select p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('has_role', 'has_school_role', 'complete_mpesa_payment')
order by p.proname;
```

If a listed table is absent, check the migration error/history. If an expected table has RLS disabled, do not launch until this is understood and fixed. These metadata checks do **not** prove that every policy is correct.

## 6. Test real account boundaries before launch

Use test data and at least these separate accounts: Super Admin, School A admin, School B admin, teacher, bursar, and parent. Verify that:

- School A users cannot read, update, or delete School B records by changing IDs or making direct API requests.
- Teachers can access only assigned classes/subjects and permitted academic records.
- Parents can access only records linked to their own children.
- A normal user cannot grant themselves roles or approve a school.
- Staff invitations only work for the invited verified email and correct school.
- The first eligible verified account can claim Super Admin, but a different account cannot replace it.
- Missing or mismatched M-Pesa amount metadata goes to review and does not extend the subscription; duplicate callbacks do not double-count a payment.

Do not use real student data during initial tests. If any cross-school access succeeds, stop and fix the RLS policies before deployment.

## 7. Confirm connection from the app

After setting environment values and applying migrations:

```sh
npm install
npm run preflight
npm run security-audit
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

Dependencies must install successfully before the last four checks can run. Then open the local app, sign in, and test the flows above. A passing static preflight/security audit is not proof of a live Supabase connection, correct RLS behavior, or a successful production build.

## 8. Before production

- Set private production environment variables and redeploy.
- Verify the private `platform-backups` Storage bucket and its access policies; test downloading and restoring a backup to a disposable database.
- Configure and verify the hosting scheduler for `/api/public/cron/shulecloud` with the private bearer secret.
- Keep M-Pesa in sandbox until callback verification, amount checks, duplicate callbacks, cancellations, and failure paths pass.
- Confirm school-to-school isolation with real authenticated API tests. Do not treat dashboard visibility alone as a security test.

