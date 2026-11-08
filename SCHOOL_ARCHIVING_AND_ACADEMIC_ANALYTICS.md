# ShuleCloud update: school archiving and academic charts

## Included in this ZIP

- Academic performance tab in the existing Exams/Marks & Attendance area.
- Mean score and assessed-student/mark totals.
- Average score by class and subject.
- Grade distribution using the school's configured grade bands.
- Examination-to-examination average trend.
- Exam and class filters; missing marks are not counted as zero.
- Super Admin can archive a school (soft archive) and restore it later. Archive requires a confirmation and a reason. It does not permanently delete data.
- Archived schools are excluded from active school counts and subscription analytics, while the Super Admin can restore them.
- SQL migration `drizzle/migrations/0005_school_archiving.sql` adds the archive field, secure archive/restore RPC, audit events, status handling, and blocks archived school roles from normal school data access.

## Important deployment step

The new school-archiving action requires migration `0005_school_archiving.sql` to be reviewed and applied to the same Supabase database used by this project. Do not run it against the wrong project. Back up the database first and apply the migration in a controlled session. Until it is applied, the new archive RPC and `archived` status are not available.

Academic charts use existing school-scoped `exams`, `classes`, `subjects`, `students`, `exam_marks`, and `grade_bands` data. They show a no-data state rather than fabricated sample results. The pass-rate card is intentionally left uncalculated unless the school's grade bands explicitly identify a failing grade/remark containing “Fail”; this avoids guessing a school's pass threshold.

## Validation status

The ZIP was created from the existing branded/charts project. A full TypeScript/build test could not be run in this environment because project dependencies were not installed; the dependency installation attempt timed out. Run the project's `npm install`/`bun install`, then `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before deploying.
