# Class teacher and subject teacher behaviour

This change is limited to the class-teacher/subject-teacher workflow.

- Each class now has one optional `class_teacher_id`.
- A teacher can be designated class teacher and independently receive one or more subject assignments through the existing `teacher_assignments` table.
- Class teachers can access their assigned class, its students, attendance and all subject marks for viewing/performance review.
- Class teachers can record attendance for their designated class.
- Entering or editing marks remains restricted to the teacher's explicit class+subject assignment (or school administrators). Class-teacher status alone does not grant mark-edit permission.
- The Staff screen now allows the school administrator to assign/remove one class teacher per class.

## Database action required
Apply `drizzle/migrations/0005_class_teacher_assignments.sql` to the existing Supabase project once, after confirming migrations 0000–0004 have already been applied. Do not reset the database or rerun earlier migrations.

## Verification performed
- Project preflight: 64/64 passed.
- Existing static database security audit: 51/51 passed.
- Full TypeScript, automated test, production build and live Supabase/RLS tests were not run because dependencies and the user's Supabase environment are not available in this workspace.
