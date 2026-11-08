import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail });
const read = (path) =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null;

check("Project manifest exists", Boolean(read("package.json")));
check("Environment template exists", Boolean(read(".env.example")));
const gitignore = read(".gitignore") ?? "";
check(
  "Local environment files are ignored by Git",
  /\.env\.\*/.test(gitignore) && /!\.env\.example/.test(gitignore),
);
const cloudConfigSource = read("src/lib/cloud/config.ts") ?? "";
check(
  "Browser cloud config rejects private service keys",
  cloudConfigSource.includes("isPrivilegedKey") &&
    cloudConfigSource.includes("assertPublishableKey"),
);
check(
  "Private service key uses server-only variable names",
  /CLOUD_SERVICE_KEY/.test(cloudConfigSource) && !/VITE_CLOUD_SERVICE_KEY/.test(cloudConfigSource),
);
check("Supabase setup walkthrough exists", Boolean(read("SUPABASE_SETUP.md")));
check("Central cloud provider configuration exists", Boolean(read("src/lib/cloud/config.ts")));
check("Cloud provider migration guide exists", Boolean(read("CLOUD_PROVIDER_ARCHITECTURE.md")));
// Public publishable values are configured separately; private keys stay in deployment secrets.
const envFile = read(".env") ?? "";
check(
  "Environment file holds no private keys",
  !/SERVICE_ROLE|ENCRYPTION_KEY|CRON_SECRET|CLIENT_SECRET|RESEND_API_KEY/.test(envFile) &&
    !existsSync(join(root, ".env.local")),
  "Do not distribute real credentials in a source ZIP.",
);

const envExample = read(".env.example") ?? "";
for (const key of [
  "CLOUD_PROVIDER",
  "CLOUD_API_URL",
  "CLOUD_PUBLIC_KEY",
  "CLOUD_SERVICE_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPER_ADMIN_EMAIL",
  "INTEGRATIONS_ENCRYPTION_KEY",
  "SHULECLOUD_CRON_SECRET",
]) {
  check(`Environment template documents ${key}`, new RegExp(`^${key}=`, "m").test(envExample));
}

const migrationDir = join(root, "drizzle/migrations");
const migrations = existsSync(migrationDir)
  ? readdirSync(migrationDir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort()
  : [];
// Migration history was consolidated when the project moved to this backend
// (foundation + one combined follow-up), so protections are checked by content.
const migrationSql = migrations.map((f) => readFileSync(join(migrationDir, f), "utf8")).join("\n");
check("Database migrations are present", migrations.length >= 2, migrations.join(", "));
const migrationJournal = read("drizzle/migrations/meta/_journal.json");
let journalHasClassTeacherMigration = false;
try {
  journalHasClassTeacherMigration =
    JSON.parse(migrationJournal ?? "{}").entries?.some(
      (entry) => entry.tag === "0005_class_teacher_assignments",
    ) ?? false;
} catch {
  journalHasClassTeacherMigration = false;
}
check(
  "Class-teacher migration is registered in Drizzle journal",
  migrations.includes("0005_class_teacher_assignments.sql") && journalHasClassTeacherMigration,
);
check(
  "Class-teacher migration keeps mark editing tied to subject assignments",
  (read("drizzle/migrations/0005_class_teacher_assignments.sql") ?? "").includes(
    "public.has_teacher_assignment(_school_id, st.class_id, _subject_id)",
  ),
);
for (const [label, pattern] of [
  ["foundation (schools, roles, academics)", /create table public\.schools/i],
  ["subscriptions", /create table public\.subscription_payments/i],
  ["integrations, SMS and backups", /create table public\.sms_messages/i],
  ["finance integrity", /protect_finance_identity/i],
  ["M-Pesa amount verification", /_paid_amount IS NULL OR _paid_amount <> t\.amount/i],
  ["school archiving", /archived_at timestamptz/i],
]) {
  check(`Migration exists: ${label}`, pattern.test(migrationSql));
}
check(
  "Single Super Admin database guard migration exists",
  /user_roles_single_super_admin_idx/i.test(migrationSql),
);
const superAdminSource = read("src/lib/admin.functions.ts") ?? "";
check(
  "Super Admin claim handles concurrent unique conflicts",
  superAdminSource.includes('insErr.code === "23505"'),
);
const gradingSource = read("src/lib/grading.ts") ?? "";
const financeSource = read("src/lib/finance.ts") ?? "";
check(
  "Report calculations reject invalid maximum scores",
  gradingSource.includes("Maximum exam score must be a positive finite number"),
);
check(
  "Report calculations reject out-of-range marks",
  gradingSource.includes("mark.score > maxScore"),
);
check(
  "Fee balance calculations reject invalid monetary values",
  financeSource.includes("Invoice amount must be a finite non-negative number"),
);

const requiredFiles = [
  "src/routes/api/public/mpesa/callback/$token.ts",
  "src/routes/api/public/cron/shulecloud.ts",
  "src/components/dashboard/StaffManager.tsx",
  "src/components/dashboard/IntegrationManager.tsx",
  "src/components/dashboard/BackupManager.tsx",
  "src/test/cloud-config.test.ts",
  "src/test/mpesa.test.ts",
  "src/test/backup.test.ts",
  "src/test/offline-attendance.test.ts",
  "src/test/offline-data.test.ts",
  "src/lib/offline-data.ts",
  "public/sw.js",
  "src/lib/google-drive-backup.server.ts",
  "src/components/dashboard/SchoolDriveBackupManager.tsx",
  "src/routes/api/public/google-drive/callback.ts",
  "src/lib/staff-invitation.functions.ts",
];
for (const path of requiredFiles)
  check(`Required source exists: ${path}`, existsSync(join(root, path)));

const schoolAdminView = read("src/components/dashboard/SchoolAdminView.tsx") ?? "";
const dashboardRoute = read("src/routes/_authenticated/dashboard.tsx") ?? "";
check(
  "Role-based dashboard routing is automatic",
  dashboardRoute.includes("roles.data") &&
    dashboardRoute.includes("<SuperAdminView") &&
    dashboardRoute.includes("<SchoolAdminView") &&
    dashboardRoute.includes("<ParentView"),
);
check(
  "Admin dashboard includes school setup and staff management",
  schoolAdminView.includes("<SchoolSetup") && schoolAdminView.includes("<StaffManager"),
);
check(
  "Teacher dashboard exposes academic tools without finance tools",
  schoolAdminView.includes('role === "school_admin" || role === "teacher"') &&
    schoolAdminView.includes('role === "school_admin" || role === "bursar"'),
);
check(
  "Parent dashboard component exists",
  existsSync(join(root, "src/components/dashboard/ParentView.tsx")),
);
check("Bursar dashboard uses finance panel", schoolAdminView.includes("<FinancePanel"));

const routeTree = read("src/routeTree.gen.ts") ?? "";
check(
  "Generated route tree includes M-Pesa callback",
  routeTree.includes("/api/public/mpesa/callback/$token"),
);
check(
  "Generated route tree includes scheduled-task endpoint",
  routeTree.includes("/api/public/cron/shulecloud"),
);
check(
  "Generated route tree includes Google Drive OAuth callback",
  routeTree.includes("/api/public/google-drive/callback"),
);
const cronRoute = read("src/routes/api/public/cron/shulecloud.ts") ?? "";
check(
  "Scheduled maintenance uses a database lease",
  cronRoute.includes("try_acquire_scheduled_job_lock") &&
    cronRoute.includes("release_scheduled_job_lock"),
);
const driveServer = read("src/lib/google-drive-backup.server.ts") ?? "";
check(
  "Google Drive backups use resumable uploads",
  driveServer.includes("uploadType=resumable") && driveServer.includes("x-upload-content-length"),
);
check(
  "Google Drive backup stores latest verified file metadata",
  driveServer.includes("last_file_id") && driveServer.includes("last_file_url"),
);
const driveCallback = read("src/routes/api/public/google-drive/callback.ts") ?? "";
check(
  "Google Drive OAuth errors never redirect to the incoming host",
  driveCallback.includes('process.env["APP_URL"]') && !driveCallback.includes("url.origin"),
);
check(
  "Concurrent platform backups are blocked by a database uniqueness guard",
  /unique index[\s\S]*backup_runs[\s\S]*where status = 'running'/i.test(migrationSql),
);
check(
  "School Drive backups and scheduled job locks are in migrations",
  /create table public\.school_drive_backups/i.test(migrationSql) &&
    /create table public\.scheduled_job_locks/i.test(migrationSql),
);
const mpesaServer = read("src/lib/integrations.functions.ts") ?? "";
check(
  "Production M-Pesa callback origin is constrained",
  mpesaServer.includes("!callbackMatchesApp"),
);
check(
  "M-Pesa calculated subscription amount is bounded",
  mpesaServer.includes("Number.isSafeInteger(amount)"),
);
const staffEmail = read("src/lib/staff-invitation.functions.ts") ?? "";
check(
  "Invitation email delivery is server-side",
  staffEmail.includes("api.resend.com/emails") && !staffEmail.includes("VITE_RESEND_API_KEY"),
);
for (const key of [
  "GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "APP_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
])
  check(`Environment template documents ${key}`, new RegExp(`^${key}=`, "m").test(envExample));

const manifest = JSON.parse(read("package.json") ?? "{}");
check("Test command is configured", typeof manifest.scripts?.test === "string");
check("Build command is configured", typeof manifest.scripts?.build === "string");
check("TypeScript check command is configured", typeof manifest.scripts?.typecheck === "string");
check("Continuous integration workflow exists", existsSync(join(root, ".github/workflows/ci.yml")));
check(
  "Static database security audit exists",
  existsSync(join(root, "scripts/security-audit.mjs")),
);
check(
  "Security audit command is configured",
  typeof manifest.scripts?.["security-audit"] === "string",
);

for (const result of checks) {
  console.log(
    `${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`,
  );
}
const failed = checks.filter((x) => !x.ok);
console.log(`\nPreflight: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exitCode = 1;
else
  console.log(
    "Static preflight passed. This does not replace tests, type-checking, build, or live integration verification.",
  );
