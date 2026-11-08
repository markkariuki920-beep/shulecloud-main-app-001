# ShuleCloud secrets setup

## Where to enter credentials

Do not paste private credentials into application source files. Add them in your hosting provider's server-side Environment Variables / Secrets settings. For local development, use an ignored `.env.local` file. Never commit `.env.local` or include it in a ZIP shared with others.

## Browser-visible configuration

The browser needs only the Supabase project URL and its publishable (or legacy anon) key:

- `VITE_CLOUD_API_URL`
- `VITE_CLOUD_PUBLIC_KEY`

These values are visible to website visitors by design. Protect all database tables with Row Level Security (RLS), and never use a service-role key here.

## Server-only secrets

Configure these only as server-side secrets, without a `VITE_` prefix:

- `CLOUD_SERVICE_KEY` (Supabase service-role / secret key)
- `INTEGRATIONS_ENCRYPTION_KEY`
- `SHULECLOUD_CRON_SECRET`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `RESEND_API_KEY`
- M-Pesa consumer secret and passkey, using the exact variable names read by the server integration code.

Do not expose server secrets through client-side environment variables, frontend settings screens, logs, screenshots, source control, or ZIP exports. A secret manager / deployment environment is the intended place to store them.

## If a secret is exposed

Revoke or rotate it with its provider immediately, update the server-side secret setting, redeploy, and review access logs. Removing it from the current source file alone does not invalidate a leaked credential.

## Super Admin access

`SUPER_ADMIN_EMAIL` is an access-control setting, not a password or API secret. Keep the actual Super Admin account protected with strong authentication and MFA where available.

## M-Pesa and SMS credentials inside ShuleCloud

M-Pesa Daraja credentials (consumer key, consumer secret and passkey) and SMS provider credentials are entered through the Super Admin **Integrations** screen, not pasted into source code. The server encrypts them using `INTEGRATIONS_ENCRYPTION_KEY` before storing them in the database. The screen returns masked hints rather than the saved secret values. Only the Super Admin can save or test these integrations.
