# ShuleCloud testing and release verification report

Date: 2026-10-28  
Scope: Checklist items 10–17 — dependency installation, automated tests, type-check/lint/build, five-role checks, workflow checks, offline/backup recovery, security and payment integrity.

## Results actually obtained in this environment

| Check | Result | Evidence / limitation |
|---|---|---|
| Dependency installation | BLOCKED | `npm install --no-audit --no-fund` and retry with `--prefer-offline` both timed out before dependencies were installed. No `node_modules` directory was created. |
| Static preflight | PASS | `npm run preflight`: 62/62 checks passed. |
| Static database security audit | PASS | `npm run security-audit`: 47/47 checks passed. This inspects migration/source patterns and is not a live Supabase penetration test. |
| TypeScript syntax parsing | PASS | TypeScript compiler API parsed 115 unique `.ts`/`.tsx` files; zero syntax diagnostics. This is syntax-only, not a type-check. |
| Automated test suite | BLOCKED | `npm test -- --reporter=dot` failed because `vitest` is not installed (`vitest: not found`). The existing test suite was not run. |
| Type-check | BLOCKED | `npm run typecheck` failed because dependency-provided type definitions `vite/client` and `vitest/globals` are unavailable. No successful type-check is claimed. |
| Lint | BLOCKED | `npm run lint` failed because `eslint` is not installed. |
| Production build | BLOCKED | `npm run build` failed because `vite` is not installed. |
| Five-role signed-in tests | NOT RUN | Requires a configured backend and separate test accounts for Super Admin, Admin/Principal, Bursar, Teacher and Parent. |
| End-to-end financial / academic workflows | NOT RUN | Requires functioning test backend, seeded records and provider sandbox configuration. |
| Offline sync and backup restore | NOT RUN end-to-end | Source-level/static checks pass, but real browser/device reconnection and disposable-database restore have not been verified. |
| Live security and payment integrity | NOT RUN | Requires a test Supabase project, test accounts, M-Pesa sandbox credentials and reachable callback URL. Do not use live customer data for these tests. |

## Commands attempted

```bash
npm install --no-audit --no-fund
npm install --no-audit --no-fund --prefer-offline
npm test -- --reporter=dot
npm run typecheck
npm run lint
npm run build
npm run preflight
npm run security-audit
```

The first two install attempts timed out. The test, type-check, lint and build commands were attempted and failed due to unavailable installed dependencies, so their outcomes must not be described as passing.

## Required verification matrix before release

### A. Dedicated test accounts and school isolation

- [ ] Sign in as Super Admin and verify only the authorized account can access platform-wide school, subscription and revenue controls.
- [ ] Sign in as Admin/Principal and verify only their own school can be configured or managed.
- [ ] Sign in as Bursar and verify finance permissions are available while unrelated administrative controls are denied.
- [ ] Sign in as Teacher and verify assigned classes/subjects, attendance, exams and marks are accessible while finance controls are denied.
- [ ] Sign in as Parent and verify only explicitly linked students and their permitted information are visible.
- [ ] Attempt cross-school reads and writes with each role; confirm the database rejects them, not just the UI.
- [ ] Verify role changes, revoked access, expired sessions and direct URL access.

### B. Core academic and financial journeys

- [ ] Create a test school, academic year, term, class, subject, staff member and student.
- [ ] Create an exam, enter valid marks, reject invalid marks, save and verify grade/grade points/report card output.
- [ ] Record attendance online; repeat offline, reconnect and verify exactly one correct record is synced.
- [ ] Create a fee invoice, record a permitted payment and verify balance, receipt and finance totals.
- [ ] Verify failed, cancelled, duplicate and mismatched M-Pesa callbacks cannot create duplicate or incorrect payments.
- [ ] Verify subscription trial, renewal, expiry and suspension do not grant unauthorized access.
- [ ] Verify staff invitation creation, expiry, acceptance, duplicate use, wrong-school use and revoked invitation behavior.

### C. Offline and recovery

- [ ] Test airplane mode, app reload and browser restart on a supported device.
- [ ] Confirm cached data is partitioned by both school and user and sensitive finance actions are not silently queued.
- [ ] Test repeated sync, conflicts, partial failure and retry without duplicate records.
- [ ] Create and verify a Google Drive backup using a dedicated test account; test upload failure and reauthorization.
- [ ] Restore a backup into a disposable test database, compare table counts and sample relationships, then delete the disposable environment.
- [ ] Verify scheduled backup and reminder jobs run once under overlapping-worker conditions and recover after worker failure.

### D. Commands required in CI or a dependency-enabled environment

Run from the project root, in order, and fix every failure:

```bash
bun install --frozen-lockfile
bun run preflight
bun run security-audit
bun run typecheck
bun run test
bun run lint
bun run build
```

The repository's `.github/workflows/ci.yml` already defines these checks. Ensure a CI run completes successfully and retain its logs before release.

## Release decision

**Not yet production-ready based on evidence available here.** Static checks and syntax parsing pass, but the dependency-backed tests, type-check, lint, build, signed-in role checks, real provider sandbox checks and backup restoration are still outstanding. No live integration or end-to-end success is claimed by this report.

## Follow-up attempt to unblock incomplete checks

Follow-up date: 2026-10-28

I retried the dependency-backed checks in the available environment:

- `npm install --no-audit --no-fund --prefer-offline` timed out again.
- `npm ping --fetch-timeout=10000 --fetch-retries=0` failed with `EAI_AGAIN` while resolving `registry.npmjs.org`, confirming that the package registry is unreachable from this environment at this time.
- `npm test -- --reporter=dot` still cannot start because `vitest` is not installed.
- `npm run typecheck` still cannot start a real type-check because `vite/client` and `vitest/globals` type definitions are unavailable.
- `npm run lint` still cannot start because `eslint` is not installed.
- `npm run build` still cannot start because `vite` is not installed.
- Re-ran `node scripts/preflight.mjs`: **62/62 passed**.
- Re-ran `node scripts/security-audit.mjs`: **47/47 passed**.
- Re-parsed TypeScript/TSX source files under `src` and `drizzle` using the globally available TypeScript parser: **112 files parsed, zero syntax errors**. This is syntax parsing only and is not a semantic type-check.

### Next action needed to finish items 10–17

Run the existing CI workflow in a network-enabled environment. From the repository root, use Bun and the checked-in `bun.lock`:

```bash
bun install --frozen-lockfile
bun run preflight
bun run security-audit
bun run typecheck
bun run test
bun run lint
bun run build
```

If any command fails, fix the source or configuration and repeat the workflow. After CI passes, continue the signed-in five-role, cross-school isolation, provider sandbox, offline synchronization and backup-restoration tests described earlier in this report. Those integration tests also require a configured test backend and provider test credentials.

**Current status remains BLOCKED / NOT PRODUCTION-READY:** the network failure prevents dependency installation here, and live backend/provider tests cannot be truthfully marked complete without their test environment.

## Follow-up: checklist items 1–5

Date: 2026-10-28

A new `.env.example` template has been added with placeholders for the required browser and server configuration. It contains no real credentials. This resolves the previously missing environment-template checks and documents that the Supabase service-role key and integration secrets are server-only.

Fresh results:

| Check | Result | Evidence / limitation |
|---|---|---|
| Environment template | PASS | `.env.example` now documents all keys required by the repository's static preflight, using placeholders only. |
| Static preflight | PASS | `node scripts/preflight.mjs`: 62/62 checks passed. |
| Static database security audit | PASS | `node scripts/security-audit.mjs`: 47/47 checks passed. |
| TypeScript syntax-only parsing | PASS | 112 `.ts`/`.tsx` files parsed; zero syntax errors. This is not a semantic type-check. |
| Dependency installation | BLOCKED | `npm install --no-audit --no-fund --prefer-offline` timed out; no `node_modules` was installed. |
| Package registry reachability | BLOCKED | `npm ping --fetch-timeout=10000 --fetch-retries=0` failed with `EAI_AGAIN` resolving `registry.npmjs.org`. |
| Automated tests | BLOCKED | `npm run test` reports `vitest: not found`. |
| Type-check | BLOCKED | `npm run typecheck` cannot resolve `vite/client` and `vitest/globals` because project dependencies are unavailable. |
| Lint | BLOCKED | `npm run lint` reports `eslint: not found`. |
| Production build | BLOCKED | `npm run build` reports `vite: not found`. |

### Exact remaining actions for items 1–5

1. In a network-enabled environment, run `bun install --frozen-lockfile` from the repository root.
2. Run `bun run test` and fix any failures.
3. Run `bun run typecheck` and fix all type errors.
4. Run `bun run lint` and fix all lint failures.
5. Run `bun run build` and fix all build errors.

The above commands are also defined in `.github/workflows/ci.yml`. Do not mark items 1–5 complete until the dependency-backed commands pass. The current static checks passing does not prove that tests, type-check, lint, or build pass.
