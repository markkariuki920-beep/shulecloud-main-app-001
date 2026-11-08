# ShuleCloud deployment portability

ShuleCloud separates its application runtime from its backend/data services. The source repository is the portable asset; a hosting provider is a deployment target, not the owner of the application.

## Current supported build targets

| Target | Command | Expected output | Use |
|---|---|---|---|
| Generic Node server | `npm run build:node` (or `npm run build`) | Nitro `.output/` | Compatible Node.js hosting |
| Cloudflare Pages | `npm run build:cloudflare` | Nitro Pages output in `dist/` | Current Cloudflare Pages deployment |

Other providers may support a dedicated Nitro preset. Confirm the current Nitro preset name and the provider's runtime requirements before adding a new target. Do not assume every provider can run every Nitro preset. A generic Node server is the fallback only where the host supports long-running Node server processes.

## What stays independent

- The application source and business logic.
- The Supabase project, database, authentication users and storage, unless separately migrated.
- The generic server-side environment variable names documented in `.env.example` and `SECRETS_SETUP.md`.

## What may need provider-specific work

- Nitro preset/build output and Node/runtime compatibility.
- Secret and environment-variable configuration.
- Scheduled jobs and cron triggers.
- M-Pesa callback/webhook URLs and provider allowlists.
- Google OAuth redirect URLs, email origins and CORS/allowed origins.
- File persistence and temporary filesystem assumptions.
- Domain, TLS and DNS configuration.

## Safe hosting migration checklist

1. Keep the existing production host running. Create a staging deployment on the destination host.
2. Connect the same source repository and select a compatible Nitro target.
3. Configure all production-equivalent environment variables and secrets in the destination host's server-side secret manager. Never put private keys in `VITE_*` variables or source code.
4. Keep the existing Supabase project and credentials if only changing hosting. Do not run database migrations just because the web host changed.
5. Update the public app origin, OAuth redirect allowlists, webhook/callback URLs, CORS settings and scheduled-job triggers.
6. Test sign-in and automatic role routing for Super Admin, Admin, Bursar, Teacher and Parent. Also test staff invitations, exams, fees, M-Pesa callbacks, SMS, email, backups, Google Drive and offline behavior.
7. Check server logs and browser network requests for errors and confirm no private credential appears in client bundles.
8. Only after staging passes, switch the production domain/DNS. Keep the old host available for rollback until the new deployment is stable.

## Hosting migration is not backend migration

`NITRO_PRESET` selects the hosting/runtime build target. `CLOUD_PROVIDER` selects the backend provider. They are separate settings. Supabase is currently the only implemented backend. Moving from Cloudflare to another host does not move the Supabase database. Moving away from Supabase requires a separate data, authentication, storage, authorization/RLS and realtime migration with its own tests.
