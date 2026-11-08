# ShuleCloud final available test report — 30 October 2026

## Scope

This report records checks run against the supplied `ShuleCloud-Hosting-Independent-Update.zip`. It does not certify production readiness or claim that external services were tested.

## Passed checks

| Check | Result | Notes |
|---|---:|---|
| ZIP integrity | PASS | Original archive extracted without CRC errors. |
| Static project preflight | PASS — 76/76 | `npm run preflight` |
| Static database/RLS migration audit | PASS — 51/51 | `npm run security-audit`; static SQL inspection only. |
| Secret exposure audit | PASS — 6/6 | `npm run secret-audit`; browser bundle scan was WARN/SKIPPED because no build output exists. |
| Hosting portability audit | PASS — 15/15 | `npm run cloudflare:check` |
| JavaScript/MJS syntax checks | PASS | Node `--check` over scripts; config JSON parsed. |
| Migration package | PASS — 6 SQL migrations | Drizzle journal and metadata snapshots for 0000–0005 are present. |
| Local credential files in release | PASS — none found | `.env.example` is included; local `.env` files are not. |
| Heuristic hardcoded-secret scan | PASS — no matches | This is a heuristic scan, not a full security review. |

## Blocked checks

| Check | Result | Reason |
|---|---|---|
| Dependency installation | BLOCKED | `npm install --no-audit --no-fund` timed out. The repository has `bun.lock` but Bun is not installed in this environment. |
| Unit tests | BLOCKED | Vitest is not installed; `npm run test` reports `vitest: not found`. |
| TypeScript check | NOT RUN | Dependencies/type declarations are unavailable. |
| ESLint | NOT RUN | Dependencies are unavailable. |
| Node production build | NOT RUN | Vite/Nitro dependencies are unavailable. |
| Cloudflare production build | NOT RUN | Vite/Nitro dependencies are unavailable. |
| Built-browser secret scan | NOT RUN | No production build output exists. |

## External checks still required

These cannot be verified from a source ZIP without the user's test environment and credentials:

- Supabase migrations applied to a disposable project, database connectivity, RLS and cross-school isolation using separate authenticated accounts.
- Email/password and Google OAuth flows, password reset, email confirmation, sessions and Super Admin restriction.
- End-to-end workflows for school setup, students, staff, classes, subjects, exams, grading, marks, attendance, parent links, invoices and reports.
- M-Pesa sandbox callbacks, signature/token validation, amount mismatch handling, duplicate callback handling and subscription extension.
- SMS/email delivery, offline synchronization and conflict recovery.
- Scheduled backup, Google Drive OAuth, download and restore.
- Cloudflare and generic Node deployment smoke tests, HTTPS, redirects, secrets, scheduled jobs, logs and monitoring.

## Release decision

**Release candidate only — not certified production-ready.** Static checks passed, but dependency-backed tests/builds and external integration tests remain outstanding. Use a disposable Supabase project and M-Pesa sandbox before any real school data or real payments. Do not reset or rerun migrations against a live database without checking which migrations have already been applied.
