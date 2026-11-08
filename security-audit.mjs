import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationDir = join(root, "drizzle/migrations");
if (!existsSync(migrationDir)) {
  console.error("FAIL Database migration directory is missing.");
  process.exit(1);
}

const files = readdirSync(migrationDir)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
const sql = files.map((name) => readFileSync(join(migrationDir, name), "utf8")).join("\n");
const createdTables = [
  ...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi),
].map((match) => match[1].toLowerCase());
const tables = [...new Set(createdTables)];
const results = [];
const add = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });

add("At least one migration is available", files.length > 0, files.join(", "));
add(
  "Public tables are declared in migrations",
  tables.length > 0,
  `${tables.length} unique tables found`,
);
for (const table of tables) {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rlsEnabled = new RegExp(
    `alter\\s+table\\s+public\\.${escaped}\\s+enable\\s+row\\s+level\\s+security`,
    "i",
  ).test(sql);
  add(
    `RLS enabled: public.${table}`,
    rlsEnabled,
    rlsEnabled ? "" : "Review this table before deployment.",
  );
}

// Migration history was consolidated when the project moved to this backend, so
// these checks look for each protection by content rather than by file name.
add(
  "M-Pesa amount verification migration exists",
  /v_review := _paid_amount IS NULL OR _paid_amount <> t\.amount/i.test(sql),
);
add("Scheduled job lease migration exists", /create table public\.scheduled_job_locks/i.test(sql));
add(
  "School Drive backup metadata migration exists",
  /last_file_id text[\s\S]*last_file_url text/i.test(sql),
);
add(
  "Concurrent platform backup guard migration exists",
  /backup_runs_single_running_idx/i.test(sql),
);
add(
  "Single Super Admin database constraint migration exists",
  /user_roles_super_admin_platform_only_check/i.test(sql),
);
add(
  "Single Super Admin role is protected by a unique partial index",
  /create unique index if not exists user_roles_single_super_admin_idx[\s\S]*where role = 'super_admin'/i.test(
    sql,
  ),
);
add(
  "Super Admin role must be platform-wide, not school-scoped",
  /check\s*\(role <> 'super_admin' or school_id is null\)/i.test(sql),
);
const adminFunctionSource = existsSync(join(root, "src/lib/admin.functions.ts"))
  ? readFileSync(join(root, "src/lib/admin.functions.ts"), "utf8")
  : "";
add(
  "Concurrent Super Admin claim unique conflicts are denied safely",
  adminFunctionSource.includes('insErr.code === "23505"'),
);
add(
  "Platform backup concurrency has a unique running-row guard",
  /create unique index if not exists backup_runs_single_running_idx[\s\S]*where status = 'running'/i.test(
    sql,
  ),
);
add(
  "Scheduled job lease table has RLS enabled",
  /alter\s+table\s+public\.scheduled_job_locks\s+enable\s+row\s+level\s+security/i.test(sql),
);
add(
  "Scheduled lock RPCs are service-role only",
  /grant\s+execute\s+on\s+function\s+public\.try_acquire_scheduled_job_lock\(text,int\),\s*public\.release_scheduled_job_lock\(text,uuid\)\s+to\s+service_role/i.test(
    sql,
  ),
);
const invitationSource = existsSync(join(root, "src/lib/staff-invitation.functions.ts"))
  ? readFileSync(join(root, "src/lib/staff-invitation.functions.ts"), "utf8")
  : "";
const mpesaServerSource = existsSync(join(root, "src/lib/integrations.functions.ts"))
  ? readFileSync(join(root, "src/lib/integrations.functions.ts"), "utf8")
  : "";
add("Invitation email delivery is server-side", /api\.resend\.com\/emails/.test(invitationSource));
add(
  "Production M-Pesa callback origin is constrained",
  /!callbackMatchesApp/.test(mpesaServerSource),
);
const driveCallbackSource = existsSync(join(root, "src/routes/api/public/google-drive/callback.ts"))
  ? readFileSync(join(root, "src/routes/api/public/google-drive/callback.ts"), "utf8")
  : "";
add(
  "Google Drive OAuth error redirects use configured APP_URL",
  /process\.env\["APP_URL"\]/.test(driveCallbackSource) && !/url\.origin/.test(driveCallbackSource),
);

for (const required of [
  ["M-Pesa transaction table", /create\s+table\s+public\.mpesa_transactions/i],
  [
    "M-Pesa transaction row-level security",
    /alter\s+table\s+public\.mpesa_transactions\s+enable\s+row\s+level\s+security/i,
  ],
  ["Financial identity protection trigger", /create\s+trigger\s+invoices_protect_identity/i],
  [
    "School-scoped invoice fee validation",
    /class-specific fee item does not match the student class/i,
  ],
  [
    "M-Pesa amount missing or mismatch requires review",
    /v_review\s*:=\s*_paid_amount\s+IS\s+NULL\s+OR\s+_paid_amount\s*<>\s*t\.amount/i,
  ],
  ["Service-role secret documented only as server configuration", /^SUPABASE_SERVICE_ROLE_KEY=/m],
]) {
  const source =
    required[0] === "Service-role secret documented only as server configuration"
      ? existsSync(join(root, ".env.example"))
        ? readFileSync(join(root, ".env.example"), "utf8")
        : ""
      : sql;
  add(required[0], required[1].test(source));
}

for (const result of results) {
  console.log(
    `${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`,
  );
}
const failed = results.filter((result) => !result.ok);
console.log(
  `\nSecurity migration audit: ${results.length - failed.length}/${results.length} checks passed.`,
);
if (failed.length) process.exitCode = 1;
else
  console.log(
    "Static migration audit passed. This is not a substitute for live Supabase/RLS penetration tests.",
  );
