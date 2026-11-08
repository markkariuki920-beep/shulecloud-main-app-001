# ShuleCloud authentication fix and verification

## Code changes in this package
- Google login now calls Supabase Auth directly (`supabase.auth.signInWithOAuth`) instead of the previous hosted auth service, so it is not dependent on an external OAuth bridge.
- Email addresses are trimmed and lowercased for sign-in, account creation, and password-reset requests.
- Provider-not-enabled errors give a useful Supabase setup message.

## Required Supabase configuration (must be done in the actual Supabase project)
1. Open Supabase Dashboard → Authentication → Sign In / Providers → Google and enable it.
2. Create/configure a Google OAuth client in Google Cloud Console.
3. Put the Google client ID and secret into the Supabase Google provider settings. Do not put the Google client secret in frontend code or this ZIP.
4. In Supabase Authentication → URL Configuration, set the Site URL to the published ShuleCloud URL and add redirect URLs for the exact deployed URL and local development URL, e.g. `https://YOUR-PUBLISHED-DOMAIN/auth` and `http://localhost:3000/auth` (use the actual development port).
5. Ensure the deployment has `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set to the same Supabase project. Server-side functions also require the server-only variables documented in `.env.example`.
6. Confirm email/password provider is enabled. If email confirmation is enabled, new users must confirm their email before password sign-in succeeds.

## Safe verification checklist
- Test password sign-in with a known test account.
- Test sign-up and email confirmation with a test address.
- Test password reset and follow the resulting link.
- Test Google login with an authorized test account; confirm the redirect returns to `/auth` and the app navigates to `/dashboard`.
- Confirm each role is assigned server-side from trusted database records, not selected by the user at login.
- Do not use real student records or production M-Pesa credentials during testing.

## Current verification limits
This source package can be statically inspected here, but successful live OAuth, email delivery, signed-in role tests, provider callbacks, and deployment require access to the configured Supabase/Google/provider accounts. Do not mark them passed until run in the actual test environment.
