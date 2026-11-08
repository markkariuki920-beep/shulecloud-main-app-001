# ShuleCloud School Management

SHULECLOUD — FINAL COMPLETION PROMPT (ULTRA CREDIT-SAVING)

Finish my existing ShuleCloud project. Do not rebuild it, redesign working screens, change the tech stack, recreate database tables, duplicate migrations, or waste credits on unnecessary changes.

Complete all six tasks in one pass:

Authentication: Fix and test email/password, Google OAuth, password reset, sessions and secure role-based login, including Super Admin restrictions.

Five dashboards: Verify and repair Super Admin, Admin/Principal, Bursar, Teacher and Parent dashboards, preserving approved designs and permissions.

Academic features: Finish and test staff, invitations, students, classes, subjects, exams, marks, grading, attendance and report cards.

Finance: Verify fees, invoices, M-Pesa payments, duplicate-payment protection, subscriptions and Super Admin revenue reports.

Backend and integrations: Verify Supabase migrations/security, school data isolation, email, SMS, offline sync, backups and Google Drive.

Final testing: Run available type checks, lint, automated tests, production build and core workflow/security tests. Fix confirmed errors.

Rules: Inspect existing code first. Reuse working features and make only necessary changes. Preserve existing data and configuration. Never expose secrets or use real payments for testing. Continue independent tasks if credentials are missing; report exact blockers.

Work through all six tasks without stopping at a plan. Do not claim tests passed unless actually run. Finish with a concise report showing changes, test results, failures, missing credentials and remaining actions. Do not claim production readiness without verification.

## Hosting and authentication

See `CLOUDFLARE_PAGES_DEPLOYMENT.md` for the existing deployment target and
`INDEPENDENCE_REVIEW.md` for remaining portability limitations. Keep the existing
accounts, database, and access policies when changing hosting.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
