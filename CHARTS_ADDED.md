# Super Admin charts added

This update adds three visual charts to the existing Subscription Management area without changing the database schema or payment/business logic:

1. **School subscription status** — live counts for active/paid, trial, read-only/overdue, expired/unpaid, and suspended schools.
2. **Confirmed subscription revenue by month** — six-month chart using the existing `subscription_revenue` Supabase RPC, so pending and rejected payments are excluded by the database function.
3. **Confirmed revenue by school** — top schools based on confirmed payments among the latest 200 payment records already loaded by the existing dashboard query.

No SQL migration was added. The existing logo asset and other project files are preserved.

Build/type checks could not be completed in this environment because dependency installation timed out. Run `npm install` (or the project's supported package manager) and `npm run typecheck` / `npm run build` before deploying.

## Academic analytics and school archive update

A new `Performance charts` tab now calculates class averages, subject averages, grade distribution, exam trends, mean score, and student/mark counts from the school's real records. It does not show sample marks. Pass rate is shown only when the school's grade bands explicitly identify a failing band.

Super Admin can soft-archive and restore a school. Archive requires confirmation and a reason, records an audit event, hides the school from active management counts, and preserves historical data. Apply migration `0005_school_archiving.sql` before using the archive/restore controls.
