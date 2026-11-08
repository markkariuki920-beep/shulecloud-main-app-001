# ShuleCloud — ChatGPT work pass (28 October 2026)

## Work completed in this pass

1. Added `drizzle/migrations/0013_single_super_admin.sql`. The database now has a unique partial index that permits at most one `super_admin` role, plus a constraint requiring that role to be platform-wide (`school_id IS NULL`). The migration deliberately stops if existing rows violate those rules instead of deleting or silently modifying roles.
2. Updated the Super Admin claim server function to handle a concurrent unique-index conflict as a denied claim instead of returning an avoidable server error. Audit-log write failure is logged without falsely claiming the role grant itself failed.
3. Hardened report calculations against zero/non-finite maximum scores and marks outside the exam range.
4. Hardened fee-balance calculations against non-finite/negative amounts and missing student IDs, preventing invalid data from silently producing `NaN` totals.
5. Added unit-test cases for the new report and finance validations.
6. Updated static preflight/security audit checks and Supabase setup notes for migration 0013.

## Checks actually completed

- Static preflight: **64/64 passed**.
- Static database security audit: **50/50 passed**.
- TypeScript/TSX syntax transpilation: **111 files, zero syntax diagnostics**.
- Pure-function smoke tests: **7 assertions passed** (grading, finance balances, and backup validation).
- ZIP integrity: checked after packaging.

## Checks not completed

- Vitest test suite, semantic TypeScript type-check, ESLint, and production build remain unverified. `npm ci` cannot run because this project has `bun.lock` rather than `package-lock.json`; an `npm install --package-lock=false` attempt timed out, consistent with the earlier package-registry network issue.
- The SQL migration was statically inspected but not executed against a live PostgreSQL/Supabase database. If existing `user_roles` contains multiple Super Admin rows or a school-scoped Super Admin, migration 0013 intentionally stops and needs manual review.
- Live dashboard, RLS penetration, invitation, M-Pesa/SMS/email, offline sync, and backup/restore end-to-end tests require a running app, a test Supabase project, and appropriate sandbox credentials.

## Setup note

Apply migration 0013 after migrations 0000–0012. Keep `SUPER_ADMIN_EMAIL=the authorised Super Admin email` server-only. The email address is a configuration value, not proof of identity; the account must authenticate and have a confirmed email.
