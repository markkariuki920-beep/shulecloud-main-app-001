# ShuleCloud hosting and cloud-provider portability

## Keep hosting separate from backend services

ShuleCloud has two independent deployment decisions:

- **Hosting/runtime provider** serves the web app and runs Nitro server routes. Select this with `NITRO_PRESET`; it is not the same as `CLOUD_PROVIDER`.
- **Backend/data provider** supplies authentication, database, storage and realtime services. `CLOUD_PROVIDER` currently selects Supabase only.

The default build is a standard Nitro `node-server` output so the project is not locked to Cloudflare. Use `npm run build:node` for a generic Node server deployment, or `npm run build:cloudflare` for Cloudflare Pages. Other hosting providers should use their documented Nitro preset or a standard Node deployment where supported; verify provider-specific runtime features before switching.

## Current state

ShuleCloud now resolves its cloud connection through one shared module:

- `src/lib/cloud/config.ts` — provider selection and environment-variable resolution.
- `src/integrations/supabase/client.ts` — browser/SSR Supabase adapter.
- `src/integrations/supabase/client.server.ts` — server-only privileged Supabase adapter.
- `src/integrations/supabase/auth-middleware.ts` — request-token verification using the shared configuration.

Application screens continue using the existing Supabase client API. This keeps the current application behavior and authorization model intact while centralizing connection configuration.

## Environment variables

New generic names are supported:

- `CLOUD_PROVIDER=supabase`
- `VITE_CLOUD_API_URL` and `CLOUD_API_URL`
- `VITE_CLOUD_PUBLIC_KEY` and `CLOUD_PUBLIC_KEY`
- `CLOUD_SERVICE_KEY` (server only; never use a `VITE_` prefix)

The existing `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` remain supported as fallbacks. Existing deployments therefore do not need an immediate environment-variable change.

## Hosting migration limitation

Changing the hosting provider does not, by itself, move the Supabase database or user accounts. It does require a compatible Nitro deployment target, environment variables/secrets, domain configuration, and testing of server routes, callbacks, scheduled jobs, OAuth redirects and file handling. Cloudflare-specific deployment bindings or scheduled-event configuration may need a provider-specific adapter.

## Important backend migration limitation

Supabase is still the only implemented provider. Setting `CLOUD_PROVIDER` to another value intentionally fails with a clear error; it does not magically translate Supabase database queries, RPC functions, authentication, Row Level Security policies, storage, or realtime features to another service.

Before supporting another provider, implement and test a provider adapter for database operations, auth/session handling, file storage, and server-side privileged operations; migrate schema, records, users, files, policies, and integrations; then run role-by-role end-to-end tests. Do not switch providers by changing environment variables alone.

## Safe future switching process

1. Implement the new provider adapter alongside the Supabase adapter.
2. Migrate and verify data and authentication.
3. Test all five dashboards and server functions against the new provider.
4. Change `CLOUD_PROVIDER` and backend credentials only after those tests pass.
5. Keep a recoverable backup of the old provider until the migration is accepted.


## Secret handling

Private credentials are not entered into source files. Configure deployment-only secrets in the hosting provider's environment settings; use an ignored `.env.local` only for local development. Only the Supabase URL and publishable/anon key are browser-visible. The service-role key and integration encryption key are server-only. ShuleCloud rejects a recognizable Supabase secret/service-role key if it is accidentally supplied as the browser publishable key. See `SECRETS_SETUP.md` for the exact setup and the Super Admin M-Pesa/SMS integration workflow.
