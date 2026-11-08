# ShuleCloud platform independence and release checkpoint — 4 November 2026

## Independent application build and runtime

- Replaced the hosted-builder-specific Vite configuration wrapper with a project-owned Vite configuration using the official TanStack Start, Nitro, React, Tailwind CSS, and TypeScript-path plugins directly.
- Removed the hosted-builder Vite configuration package from `package.json`. The application build no longer imports or requires that package.
- Official ShuleCloud logo and favicon are local assets under `public/`; the app does not need an externally hosted image to display its branding.
- Supabase browser authentication uses `@supabase/supabase-js` directly. Email/password, registration, password recovery, session persistence, sign-out, and Google OAuth do not use an external hosted auth broker.
- Removed the generated preview-auth storage broker and its client-side import. Supabase now uses its normal browser session storage.
- Signup and password recovery build their redirect destinations from the current ShuleCloud origin. The production Supabase Site URL, redirect allowlist, and email templates must also be configured as described in `SUPABASE_SETUP.md`; source code cannot override a hardcoded URL in a Supabase email template.
- The Super Admin email is not embedded in source. The server-side `claimSuperAdmin` function reads `SUPER_ADMIN_EMAIL`, verifies the authenticated user's authoritative Supabase Auth record, and grants the role only if no different Super Admin already exists. Set this variable privately in the deployment environment.
- Cron authentication uses `SHULECLOUD_CRON_SECRET` and optional `SHULECLOUD_CRON_SECRET_PREVIOUS`, not a platform-specific secret name.
- Drizzle migration configuration uses `DATABASE_URL` rather than a platform-specific migration URL.
- Removed the preview auth broker source and obsolete editor project metadata from this package.

## Deployment requirements still owned by the project administrator

1. In the Supabase project used by ShuleCloud, set Site URL to `https://shulecloud.pages.dev` (or the actual production domain) and allow `/auth` and `/reset-password` redirects. Keep the Confirm Signup email action link as `{{ .ConfirmationURL }}`. Send a new verification email after correcting settings; old links can retain their old destination.
2. Add the project's browser URL and publishable key as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Cloudflare Pages.
3. Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as server-side values for server operations. The service-role key must be private and must never use a `VITE_` prefix. The generic `CLOUD_*` aliases may also be set to the same backend as documented.
4. Set `SUPER_ADMIN_EMAIL` as a private Cloudflare variable/secret. The email address itself is intentionally absent from the source archive.
5. Set `INTEGRATIONS_ENCRYPTION_KEY`, `SHULECLOUD_CRON_SECRET`, `APP_URL`, and any integration credentials needed for enabled features. Keep secrets private and stable where the documentation says they must be stable.
6. Configure Google OAuth in the Supabase project and register the exact callback URL shown by Supabase with Google. The app code can initiate Google OAuth, but it cannot supply the owner's client ID/secret.
7. Apply database migrations only after checking which ones are already applied. The current migration sequence is `0000` through `0006`; see `SUPABASE_SETUP.md`.

## Verification status

The source configuration has been migrated away from the hosted-builder Vite wrapper. The official TanStack Start and Nitro Vite plugin arrangement is used, while preserving the app's custom server entry, React deduplication, Tailwind CSS, TypeScript path aliases, and Cloudflare/Node Nitro presets.

Static checks previously run on the preceding source checkpoint:

- Preflight: 76/76 passed.
- Security audit: 51/51 passed.
- Cloudflare configuration audit: 15/15 passed.
- Secret audit: 6/6 passed; the generated-build scan was skipped because no `dist/` output existed at the time.
- Earlier unit-test report: 42 tests passed across 9 files. This is a historical result, not a fresh test run after the build-tool migration.

A fresh dependency install and production build have not yet been completed in this environment. Therefore a fresh TypeScript check, lint run, full unit-test run, and Cloudflare production build are **not certified**. No live Cloudflare deployment, live Supabase authentication, role-boundary test, or provider integration test is claimed here. Run the release checks in `CLOUDFLARE_PAGES_DEPLOYMENT.md` before replacing the currently deployed version.

## Scope

This is a source-code and configuration update. It does not change or reset the Supabase database, migrate school records, create OAuth credentials, configure Cloudflare secrets, or verify external services. Keep the existing deployment available until the updated build and live tests pass.

## Final source audit follow-up

- Renamed the package identity to `shulecloud` in both the manifest and Bun workspace lockfile.
- Updated GitHub Actions to pin Bun 1.4.4, run all static/security/Cloudflare checks, and build the Cloudflare Pages target; CI also scans generated browser assets for secrets after the build.
- See `FINAL_DEBUG_AUDIT.md` for the checks actually run and the environment-blocked tests. Do not treat blocked tests as passing.
