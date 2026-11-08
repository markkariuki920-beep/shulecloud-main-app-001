import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptJson, encryptJson } from "./integrations.server";

const callbackPath = "/api/public/google-drive/callback";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- drive backup tables are typed after Cloud type regeneration
const db = supabaseAdmin as any;
type Frequency = "daily" | "every_3_days" | "weekly" | "manual";
type OAuthState = { schoolId: string; userId: string; exp: number; nonce: string };
type StoredToken = { refresh_token: string };
const encoder = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
const fromB64url = (s: string) =>
  Uint8Array.from(
    atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)),
    (c) => c.charCodeAt(0),
  );
function appUrl() {
  const configured = process.env["APP_URL"]?.trim().replace(/\/$/, "");
  if (!configured)
    throw new Error(
      "Set APP_URL to the published HTTPS ShuleCloud URL before connecting Google Drive.",
    );
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("APP_URL must be a valid HTTPS origin, for example https://school.example");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== configured ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "APP_URL must be the published HTTPS origin only, without a path, query or fragment",
    );
  }
  return parsed.origin;
}
async function signState(payload: OAuthState) {
  const secret = process.env["INTEGRATIONS_ENCRYPTION_KEY"];
  if (!secret) throw new Error("Server encryption key is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", encoder.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const sig = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body))));
  return `${body}.${sig}`;
}
async function verifyState(state: string): Promise<OAuthState> {
  const [body, signature] = state.split(".");
  if (!body || !signature) throw new Error("Invalid Google authorization state");
  const secret = process.env["INTEGRATIONS_ENCRYPTION_KEY"];
  if (!secret) throw new Error("Server encryption key is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", encoder.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (!(await crypto.subtle.verify("HMAC", key, fromB64url(signature), encoder.encode(body))))
    throw new Error("Google authorization state did not verify");
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as OAuthState;
  if (
    !payload.schoolId ||
    !payload.userId ||
    !Number.isFinite(payload.exp) ||
    payload.exp < Date.now()
  )
    throw new Error("Google authorization expired. Start again from School backups.");
  return payload;
}
function googleEnv() {
  const clientId = process.env["GOOGLE_DRIVE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_DRIVE_CLIENT_SECRET"];
  if (!clientId || !clientSecret)
    throw new Error(
      "Google Drive OAuth is not configured. Add GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET to private server secrets.",
    );
  return { clientId, clientSecret, redirectUri: `${appUrl()}${callbackPath}` };
}
export async function createGoogleConnectUrl(schoolId: string, userId: string) {
  const { data: isAdmin } = await supabaseAdmin.rpc("has_school_role", {
    _user_id: userId,
    _school_id: schoolId,
    _role: "school_admin",
  });
  if (!isAdmin) throw new Error("Only this school's admin can connect Google Drive");
  const env = googleEnv();
  const state = await signState({
    schoolId,
    userId,
    exp: Date.now() + 10 * 60_000,
    nonce: crypto.randomUUID(),
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: "code",
    scope:
      "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.toString();
}
export async function finishGoogleOAuth(code: string, state: string) {
  const payload = await verifyState(state);
  const { data: isAdmin } = await supabaseAdmin.rpc("has_school_role", {
    _user_id: payload.userId,
    _school_id: payload.schoolId,
    _role: "school_admin",
  });
  if (!isAdmin)
    throw new Error("The school admin permission changed before Google Drive connection completed");
  const env = googleEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokens = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };
  if (!response.ok || !tokens.access_token)
    throw new Error(`Google token exchange failed: ${tokens.error || response.status}`);
  const old = await db
    .from("school_drive_backups")
    .select(
      "refresh_token_encrypted,frequency,enabled,last_run_at,last_success_at,last_status,last_error,last_file_id,last_file_name,last_file_url,created_by",
    )
    .eq("school_id", payload.schoolId)
    .maybeSingle();
  let refreshToken = tokens.refresh_token;
  if (!refreshToken && old.data?.refresh_token_encrypted) {
    refreshToken = (await decryptJson<StoredToken>(old.data.refresh_token_encrypted)).refresh_token;
  }
  if (!refreshToken)
    throw new Error(
      "Google did not provide a refresh token. Remove ShuleCloud from your Google Account access and connect again.",
    );
  const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const identity = who.ok ? ((await who.json()) as { email?: string }) : {};
  const { error } = await db.from("school_drive_backups").upsert(
    {
      ...old.data,
      school_id: payload.schoolId,
      refresh_token_encrypted: await encryptJson({ refresh_token: refreshToken }),
      google_email: identity.email ?? null,
      connected_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
      created_by: payload.userId,
    },
    { onConflict: "school_id" },
  );
  if (error) throw new Error("Could not save the Google Drive connection");
  return `${appUrl()}/dashboard?driveBackup=connected#school-backups`;
}
export async function getSchoolDriveStatus(schoolId: string, userId: string) {
  const { data: isAdmin } = await supabaseAdmin.rpc("has_school_role", {
    _user_id: userId,
    _school_id: schoolId,
    _role: "school_admin",
  });
  if (!isAdmin) throw new Error("Only this school's admin can view backup settings");
  const { data, error } = await db
    .from("school_drive_backups")
    .select(
      "enabled,frequency,google_email,connected_at,last_run_at,last_success_at,last_status,last_error,last_file_id,last_file_name,last_file_url",
    )
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw new Error("Could not load Google Drive backup settings");
  return (
    data ?? {
      enabled: false,
      frequency: "weekly",
      google_email: null,
      connected_at: null,
      last_run_at: null,
      last_success_at: null,
      last_status: null,
      last_error: null,
      last_file_id: null,
      last_file_name: null,
      last_file_url: null,
    }
  );
}
export async function saveSchoolDriveSettings(
  schoolId: string,
  userId: string,
  frequency: Frequency,
  enabled: boolean,
) {
  const { data: isAdmin } = await supabaseAdmin.rpc("has_school_role", {
    _user_id: userId,
    _school_id: schoolId,
    _role: "school_admin",
  });
  if (!isAdmin) throw new Error("Only this school's admin can change backup settings");
  const { data: current } = await db
    .from("school_drive_backups")
    .select(
      "refresh_token_encrypted,google_email,connected_at,last_run_at,last_success_at,last_status,last_error,last_file_id,last_file_name,last_file_url,created_by",
    )
    .eq("school_id", schoolId)
    .maybeSingle();
  if (enabled && !current?.refresh_token_encrypted)
    throw new Error("Connect Google Drive before enabling automatic backups");
  const { error } = await db.from("school_drive_backups").upsert(
    {
      ...current,
      school_id: schoolId,
      frequency,
      enabled,
      updated_at: new Date().toISOString(),
      created_by: userId,
    },
    { onConflict: "school_id", ignoreDuplicates: false },
  );
  if (error) throw new Error("Could not save Google Drive backup settings");
  return getSchoolDriveStatus(schoolId, userId);
}
async function getAccessToken(refreshToken: string) {
  const env = googleEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !data.access_token)
    throw new Error(`Google token refresh failed: ${data.error || response.status}`);
  return data.access_token;
}
async function driveRequest(token: string, url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status})`);
  return response;
}
async function getOrCreateFolder(token: string, folderName: string) {
  const q = encodeURIComponent(
    `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const search = await driveRequest(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=10`,
  );
  const found = (await search.json()) as { files?: { id: string }[] };
  if (found.files?.[0]?.id) return found.files[0].id;
  const created = await driveRequest(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder" }),
  });
  return ((await created.json()) as { id: string }).id;
}
const SCHOOL_TABLES = [
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
  "subscription_payments",
  "mpesa_transactions",
  "sms_messages",
] as const;
export async function runSchoolDriveBackup(
  schoolId: string,
  trigger: "manual" | "scheduled" = "manual",
) {
  const { data: settings } = await db
    .from("school_drive_backups")
    .select("refresh_token_encrypted,google_email")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!settings?.refresh_token_encrypted)
    throw new Error("Google Drive is not connected for this school");
  const { data: school, error: schoolError } = await db
    .from("schools")
    .select("id,name,level,county,phone,email,trial_ends_at,paid_until,created_at")
    .eq("id", schoolId)
    .single();
  if (schoolError || !school) throw new Error("Could not load school for backup");
  try {
    const refresh = await decryptJson<StoredToken>(settings.refresh_token_encrypted);
    const token = await getAccessToken(refresh.refresh_token);
    const tables: Record<string, unknown[]> = { schools: [school] };
    for (const table of SCHOOL_TABLES) {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db
          .from(table)
          .select("*")
          .eq("school_id", schoolId)
          .range(offset, offset + 999);
        if (error) throw new Error(`Could not back up ${table}`);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      tables[table] = rows;
    }
    const payload = JSON.stringify(
      {
        format: "shulecloud-school-backup",
        version: 1,
        school_id: schoolId,
        school_name: school.name,
        created_at: new Date().toISOString(),
        trigger,
        tables,
      },
      null,
      2,
    );
    const folder = await getOrCreateFolder(
      token,
      `ShuleCloud-Backup-${String(school.name)
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .slice(0, 80)}`,
    );
    const fileName = `shulecloud-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const metadata = JSON.stringify({
      name: fileName,
      mimeType: "application/json",
      parents: [folder],
      appProperties: { schoolId, product: "ShuleCloud" },
    });
    // Use the resumable upload API so larger schools are not limited by multipart upload size.
    const startUpload = await driveRequest(
      token,
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-type": "application/json",
          "x-upload-content-length": String(new TextEncoder().encode(payload).byteLength),
        },
        body: metadata,
      },
    );
    const uploadUrl = startUpload.headers.get("location");
    if (!uploadUrl) throw new Error("Google Drive did not provide a resumable upload URL");
    const uploadedResponse = await driveRequest(token, uploadUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    const uploaded = (await uploadedResponse.json()) as {
      id?: string;
      name?: string;
      webViewLink?: string;
    };
    if (!uploaded.id) throw new Error("Google Drive did not confirm the backup file");
    const verification = await driveRequest(
      token,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploaded.id)}?alt=media`,
    );
    if ((await verification.text()) !== payload)
      throw new Error(
        "Google Drive backup verification failed: downloaded content did not match the uploaded data",
      );
    const finishedAt = new Date().toISOString();
    const { error: statusError } = await db
      .from("school_drive_backups")
      .update({
        last_run_at: finishedAt,
        last_success_at: finishedAt,
        last_status: "success",
        last_error: null,
        last_file_id: uploaded.id,
        last_file_name: uploaded.name ?? fileName,
        last_file_url:
          uploaded.webViewLink ??
          `https://drive.google.com/open?id=${encodeURIComponent(uploaded.id)}`,
      })
      .eq("school_id", schoolId);
    if (statusError)
      throw new Error(
        "Backup uploaded and verified, but ShuleCloud could not save its backup status. Check the database migration and retry.",
      );
    return {
      ok: true,
      fileId: uploaded.id,
      fileName: uploaded.name ?? fileName,
      fileUrl:
        uploaded.webViewLink ??
        `https://drive.google.com/open?id=${encodeURIComponent(uploaded.id)}`,
      tables: Object.keys(tables).length,
      rows: Object.values(tables).reduce((n, r) => n + r.length, 0),
    };
  } catch (error) {
    const message = (error as Error).message.slice(0, 300);
    await db
      .from("school_drive_backups")
      .update({ last_run_at: new Date().toISOString(), last_status: "failed", last_error: message })
      .eq("school_id", schoolId);
    throw error;
  }
}
export async function runDueSchoolDriveBackups() {
  // Oldest/never-run schedules are handled first so a busy installation with more than
  // 100 schools does not permanently starve later schools. Each cron invocation is bounded.
  const { data, error } = await db
    .from("school_drive_backups")
    .select("school_id,frequency,last_run_at")
    .eq("enabled", true)
    .neq("frequency", "manual")
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(25);
  if (error) throw new Error("Could not load due school backup schedules");
  const now = Date.now();
  let completed = 0;
  for (const row of data ?? []) {
    const interval = row.frequency === "daily" ? 1 : row.frequency === "every_3_days" ? 3 : 7;
    if (row.last_run_at && now - new Date(row.last_run_at).getTime() < interval * 86_400_000)
      continue;
    try {
      await runSchoolDriveBackup(row.school_id, "scheduled");
      completed++;
    } catch (error) {
      console.error("School Drive backup failed", row.school_id, (error as Error).message);
    }
  }
  return { completed, considered: (data ?? []).length };
}
