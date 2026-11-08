// Backup file format and checks shared by the server and tests.

/** Every table holding recoverable school or platform data. Provider credentials are deliberately excluded. */
export const BACKUP_TABLES = [
  "profiles",
  "schools",
  "user_roles",
  "school_applications",
  "audit_logs",
  "academic_years",
  "terms",
  "classes",
  "subjects",
  "students",
  "staff_invitations",
  "teacher_assignments",
  "grade_bands",
  "exams",
  "exam_marks",
  "attendance",
  "fee_items",
  "invoices",
  "payments",
  "parent_links",
  "platform_settings",
  "subscription_plans",
  "subscription_payments",
  "mpesa_transactions",
  "sms_messages",
] as const;

export type BackupFile = {
  format: "shulecloud-backup";
  version: 1;
  created_at: string;
  tables: Record<string, unknown[]>;
};

/** Checks a downloaded backup parses and holds exactly the expected rows per table. */
export function verifyBackup(
  text: string,
  expected: Record<string, number>,
): { ok: true } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Backup file is not readable" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Backup file has the wrong format" };
  }
  const candidate = parsed as Partial<BackupFile>;
  if (
    candidate.format !== "shulecloud-backup" ||
    candidate.version !== 1 ||
    typeof candidate.created_at !== "string" ||
    !Number.isFinite(Date.parse(candidate.created_at)) ||
    !candidate.tables ||
    typeof candidate.tables !== "object" ||
    Array.isArray(candidate.tables)
  ) {
    return { ok: false, error: "Backup file has the wrong format or unsupported version" };
  }

  const tables = candidate.tables as Record<string, unknown>;
  for (const [name, rows] of Object.entries(tables)) {
    if (!Array.isArray(rows)) return { ok: false, error: `Table ${name} is not a row list` };
    if (rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      return { ok: false, error: `Table ${name} contains an invalid row` };
    }
  }
  for (const [name, count] of Object.entries(expected)) {
    if (!Number.isSafeInteger(count) || count < 0)
      return { ok: false, error: `Expected row count for ${name} is invalid` };
    const rows = tables[name];
    if (!Array.isArray(rows))
      return { ok: false, error: `Table ${name} is missing from the backup` };
    if (rows.length !== count)
      return { ok: false, error: `Table ${name} has ${rows.length} rows, expected ${count}` };
  }
  return { ok: true };
}

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type RestoreCandidate = {
  status: string;
  file_path: string | null;
  file_deleted_at: string | null;
  checksum: string | null;
  table_counts: Record<string, number> | null;
};

/** Decides whether a saved backup may be restored; returns the parsed tables only when every check passes. */
export async function checkRestorable(
  run: RestoreCandidate | null,
  text: string | null,
): Promise<{ ok: true; tables: Record<string, unknown[]> } | { ok: false; error: string }> {
  if (!run || run.status !== "success" || !run.file_path || run.file_deleted_at)
    return { ok: false, error: "This backup is not available to restore" };
  if (!run.checksum || !run.table_counts)
    return { ok: false, error: "This backup has no verification record and cannot be restored" };
  if (text == null) return { ok: false, error: "The backup file could not be read" };
  if ((await sha256Hex(text)) !== run.checksum)
    return { ok: false, error: "The backup file has changed since it was saved; restore refused" };
  const v = verifyBackup(text, run.table_counts);
  if (!v.ok) return { ok: false, error: `Restore refused: ${v.error}` };
  return { ok: true, tables: (JSON.parse(text) as BackupFile).tables };
}
