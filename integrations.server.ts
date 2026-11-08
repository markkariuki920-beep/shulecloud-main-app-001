// Server-only: provider credentials, M-Pesa Daraja calls, SMS sending, backups.
// Credentials are encrypted with INTEGRATIONS_ENCRYPTION_KEY before they are stored and are never returned to browsers or logged.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  darajaBaseUrl,
  darajaTimestamp,
  maskSecret,
  normalizeKePhone,
  stkResultStatus,
} from "./mpesa";
import { BACKUP_TABLES, checkRestorable, sha256Hex, verifyBackup } from "./backup";

type Admin = typeof supabaseAdmin;
export type Provider = "mpesa" | "sms";

export type MpesaConfig = {
  environment: "sandbox" | "production";
  shortcode: string;
  transaction_type: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  party_b?: string;
  account_reference?: string;
  callback_base_url: string;
};
export type MpesaSecrets = {
  consumer_key?: string;
  consumer_secret?: string;
  passkey?: string;
  callback_token?: string;
};
export type SmsConfig = {
  provider: "africastalking" | "twilio";
  environment: "sandbox" | "production";
  username?: string;
  sender_id?: string;
  account_sid?: string;
  from_number?: string;
};
export type SmsSecrets = { api_key?: string; auth_token?: string };

export const SECRET_FIELDS: Record<Provider, string[]> = {
  mpesa: ["consumer_key", "consumer_secret", "passkey"],
  sms: ["api_key", "auth_token"],
};

// ---------- encryption ----------
async function aesKey() {
  const raw = process.env["INTEGRATIONS_ENCRYPTION_KEY"];
  if (!raw) throw new Error("Server encryption key is not configured");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptJson(obj: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(),
    new TextEncoder().encode(JSON.stringify(obj)),
  );
  return `${b64(iv)}.${b64(new Uint8Array(ct))}`;
}
export async function decryptJson<T>(s: string | null): Promise<T> {
  if (!s) return {} as T;
  const [iv, ct] = s.split(".");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv!) },
    await aesKey(),
    unb64(ct!),
  );
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

// ---------- settings ----------
export async function loadSettings<C, S>(admin: Admin, provider: Provider) {
  const { data, error } = await admin
    .from("integration_settings")
    .select("*")
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error("Could not load settings");
  const config = (data?.config ?? {}) as C;
  const secrets = await decryptJson<S>(data?.secrets_encrypted ?? null);
  return { row: data, config, secrets, enabled: !!data?.enabled, verified: !!data?.verified_at };
}

export function missingFields(
  provider: Provider,
  config: Record<string, unknown>,
  secrets: Record<string, unknown>,
) {
  const need = (o: Record<string, unknown>, keys: string[]) =>
    keys.filter((k) => !String(o[k] ?? "").trim());
  if (provider === "mpesa") {
    return [
      ...need(config, ["environment", "shortcode", "transaction_type", "callback_base_url"]),
      ...need(secrets, ["consumer_key", "consumer_secret", "passkey"]),
    ];
  }
  if (config["provider"] === "twilio")
    return [...need(config, ["account_sid", "from_number"]), ...need(secrets, ["auth_token"])];
  return [...need(config, ["provider", "environment", "username"]), ...need(secrets, ["api_key"])];
}

export function hintsFor(secrets: Record<string, string | undefined>, provider: Provider) {
  return Object.fromEntries(
    SECRET_FIELDS[provider].filter((k) => secrets[k]).map((k) => [k, maskSecret(secrets[k]!)]),
  );
}

// ---------- M-Pesa Daraja ----------
async function darajaFetch(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { ok: res.ok, status: res.status, json };
}

export async function darajaToken(c: MpesaConfig, s: MpesaSecrets) {
  const auth = btoa(`${s.consumer_key}:${s.consumer_secret}`);
  const r = await darajaFetch(
    `${darajaBaseUrl(c.environment)}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  const token = r.json["access_token"];
  if (!r.ok || typeof token !== "string")
    throw new Error(`Safaricom refused the Consumer Key/Secret (HTTP ${r.status})`);
  return token;
}

const stkPassword = (c: MpesaConfig, s: MpesaSecrets, ts: string) =>
  btoa(`${c.shortcode}${s.passkey}${ts}`);

export async function stkPush(
  c: MpesaConfig,
  s: MpesaSecrets,
  p: { phone: string; amount: number; account: string; txId: string },
) {
  const token = await darajaToken(c, s);
  const ts = darajaTimestamp();
  const callback = `${c.callback_base_url.replace(/\/+$/, "")}/api/public/mpesa/callback/${s.callback_token}`;
  const r = await darajaFetch(`${darajaBaseUrl(c.environment)}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: c.shortcode,
      Password: stkPassword(c, s, ts),
      Timestamp: ts,
      TransactionType: c.transaction_type,
      Amount: Math.round(p.amount),
      PartyA: p.phone,
      PartyB: c.party_b?.trim() || c.shortcode,
      PhoneNumber: p.phone,
      CallBackURL: callback,
      AccountReference: p.account.slice(0, 12),
      TransactionDesc: "Subscription",
    }),
  });
  if (r.json["ResponseCode"] !== "0" || typeof r.json["CheckoutRequestID"] !== "string") {
    throw new Error(
      String(
        r.json["errorMessage"] ??
          r.json["ResponseDescription"] ??
          `M-Pesa request failed (HTTP ${r.status})`,
      ),
    );
  }
  return {
    checkoutRequestId: r.json["CheckoutRequestID"] as string,
    merchantRequestId: String(r.json["MerchantRequestID"] ?? ""),
    customerMessage: String(
      r.json["CustomerMessage"] ?? "Check your phone and enter your M-Pesa PIN.",
    ),
  };
}

/** Asks Safaricom for the real result of an STK request. Returns null while it is still processing or unreachable. */
export async function stkQuery(c: MpesaConfig, s: MpesaSecrets, checkoutRequestId: string) {
  try {
    const token = await darajaToken(c, s);
    const ts = darajaTimestamp();
    const r = await darajaFetch(`${darajaBaseUrl(c.environment)}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: c.shortcode,
        Password: stkPassword(c, s, ts),
        Timestamp: ts,
        CheckoutRequestID: checkoutRequestId,
      }),
    });
    if (r.json["ResultCode"] === undefined) return null; // e.g. "transaction is being processed"
    return {
      resultCode: String(r.json["ResultCode"]),
      resultDesc: String(r.json["ResultDesc"] ?? ""),
    };
  } catch (e) {
    console.error("M-Pesa status check failed:", (e as Error).message);
    return null;
  }
}

/** Resolves pending M-Pesa prompts by asking Safaricom. Old unanswered prompts become timed out. */
export async function resolvePendingMpesa(admin: Admin, onlyTxId?: string) {
  const { config, secrets, enabled } = await loadSettings<MpesaConfig, MpesaSecrets>(
    admin,
    "mpesa",
  );
  let q = admin
    .from("mpesa_transactions")
    .select("id, checkout_request_id, created_at, environment")
    .eq("status", "pending");
  q = onlyTxId
    ? q.eq("id", onlyTxId)
    : q
        .lt("created_at", new Date(Date.now() - 90_000).toISOString())
        .order("created_at")
        .limit(10);
  const { data } = await q;
  let resolved = 0;
  for (const t of data ?? []) {
    const ageMin = (Date.now() - new Date(t.created_at).getTime()) / 60000;
    if (!t.checkout_request_id) {
      if (ageMin > 5)
        await admin.rpc("complete_mpesa_payment", {
          _tx_id: t.id,
          _status: "failed",
          _result_code: "",
          _result_desc: "The prompt could not be sent",
          _receipt: "",
          _paid_amount: null as never,
        });
      continue;
    }
    const sameEnv = config.environment === t.environment;
    const r = enabled && sameEnv ? await stkQuery(config, secrets, t.checkout_request_id) : null;
    if (r) {
      const st = stkResultStatus(r.resultCode);
      if (st !== "pending") {
        await admin.rpc("complete_mpesa_payment", {
          _tx_id: t.id,
          _status: st,
          _result_code: r.resultCode,
          _result_desc: r.resultDesc,
          _receipt: "",
          _paid_amount: null as never,
        });
        resolved++;
      }
    } else if (ageMin > 30) {
      await admin.rpc("complete_mpesa_payment", {
        _tx_id: t.id,
        _status: "timeout",
        _result_code: "",
        _result_desc: "No answer from M-Pesa within 30 minutes",
        _receipt: "",
        _paid_amount: null as never,
      });
      resolved++;
    }
  }
  return resolved;
}

// ---------- SMS ----------
export async function sendSms(
  c: SmsConfig,
  s: SmsSecrets,
  to: string,
  message: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const phone = normalizeKePhone(to);
  if (!phone) return { ok: false, error: "Phone number is not a valid Kenyan mobile number" };
  try {
    if (c.provider === "twilio") {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.account_sid ?? "")}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${c.account_sid}:${s.auth_token}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: `+${phone}`, From: c.from_number ?? "", Body: message }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return res.ok && j["sid"]
        ? { ok: true, id: String(j["sid"]) }
        : { ok: false, error: String(j["message"] ?? `Twilio error (HTTP ${res.status})`) };
    }
    const host =
      c.environment === "production"
        ? "https://api.africastalking.com"
        : "https://api.sandbox.africastalking.com";
    const body = new URLSearchParams({ username: c.username ?? "", to: `+${phone}`, message });
    if (c.sender_id?.trim()) body.set("from", c.sender_id.trim());
    const res = await fetch(`${host}/version1/messaging`, {
      method: "POST",
      headers: {
        apiKey: s.api_key ?? "",
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let j: {
      SMSMessageData?: {
        Message?: string;
        Recipients?: { statusCode?: number; status?: string; messageId?: string }[];
      };
    } = {};
    try {
      j = JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: `Africa's Talking error (HTTP ${res.status}): ${text.slice(0, 120)}`,
      };
    }
    const r = j.SMSMessageData?.Recipients?.[0];
    if (res.ok && r && [100, 101, 102].includes(Number(r.statusCode)))
      return { ok: true, id: r.messageId ?? "" };
    return {
      ok: false,
      error:
        r?.status ?? j.SMSMessageData?.Message ?? `Africa's Talking error (HTTP ${res.status})`,
    };
  } catch (e) {
    return { ok: false, error: `Could not reach the SMS provider: ${(e as Error).message}` };
  }
}

const MAX_SMS_ATTEMPTS = 3;

/** Sends queued SMS once each. Failures retry up to 3 times, 30 minutes apart, then stay failed. */
export async function processSmsQueue(admin: Admin, limit = 20) {
  const { config, secrets, enabled, verified } = await loadSettings<SmsConfig, SmsSecrets>(
    admin,
    "sms",
  );
  if (!enabled || !verified) return { sent: 0, failed: 0, skipped: "SMS is switched off" };
  const { data: batch, error } = await admin.rpc("claim_sms_batch", { _limit: limit });
  if (error) throw new Error("Could not read the SMS queue");
  let sent = 0,
    failed = 0;
  for (const m of batch ?? []) {
    const r = await sendSms(config, secrets, m.to_phone, m.body);
    if (r.ok) {
      sent++;
      await admin
        .from("sms_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider: config.provider,
          provider_message_id: r.id,
          last_error: null,
        })
        .eq("id", m.id);
    } else {
      failed++;
      const retry = m.attempts < MAX_SMS_ATTEMPTS;
      await admin
        .from("sms_messages")
        .update({
          status: retry ? "queued" : "failed",
          provider: config.provider,
          last_error: r.error.slice(0, 300),
          next_attempt_at: new Date(Date.now() + m.attempts * 30 * 60_000).toISOString(),
        })
        .eq("id", m.id);
    }
  }
  return { sent, failed };
}

// ---------- backups ----------
const BUCKET = "platform-backups";
const pkOf = (t: string) => (t === "subscription_plans" ? "level" : "id");

async function readAll(admin: Admin, table: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from(table as never)
      .select("*")
      .order(pkOf(table))
      .range(from, from + 999);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

/** Creates a full data backup, re-downloads it to verify it, then applies the retention period. */
export async function runBackup(
  admin: Admin,
  trigger: "manual" | "scheduled",
  startedBy: string | null,
) {
  await admin
    .from("backup_runs")
    .update({
      status: "failed",
      error: "Backup did not finish",
      finished_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const { data: running } = await admin
    .from("backup_runs")
    .select("id")
    .eq("status", "running")
    .limit(1);
  if (running?.length) throw new Error("A backup is already running");

  const { data: run, error: runErr } = await admin
    .from("backup_runs")
    .insert({ trigger, started_by: startedBy })
    .select("id")
    .single();
  if (runErr || !run) throw new Error("Could not start the backup");
  const path = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  try {
    const tables: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      tables[t] = await readAll(admin, t);
      counts[t] = tables[t].length;
    }
    const text = JSON.stringify({
      format: "shulecloud-backup",
      version: 1,
      created_at: new Date().toISOString(),
      tables,
    });
    const checksum = await sha256Hex(text);
    const up = await admin.storage
      .from(BUCKET)
      .upload(path, new Blob([text], { type: "application/json" }), {
        contentType: "application/json",
        upsert: false,
      });
    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);

    const dl = await admin.storage.from(BUCKET).download(path);
    if (dl.error || !dl.data) throw new Error("Could not read the backup back for verification");
    const back = await dl.data.text();
    if ((await sha256Hex(back)) !== checksum)
      throw new Error("Verification failed: file changed after upload");
    const v = verifyBackup(back, counts);
    if (!v.ok) throw new Error(`Verification failed: ${v.error}`);

    const now = new Date().toISOString();
    await admin
      .from("backup_runs")
      .update({
        status: "success",
        finished_at: now,
        verified_at: now,
        file_path: path,
        size_bytes: text.length,
        checksum,
        table_counts: counts,
      })
      .eq("id", run.id);
    await applyRetention(admin);
    return {
      id: run.id,
      rows: Object.values(counts).reduce((a, b) => a + b, 0),
      size: text.length,
    };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await admin
      .from("backup_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: msg,
        file_path: null,
      })
      .eq("id", run.id);
    await admin.storage
      .from(BUCKET)
      .remove([path])
      .catch(() => null);
    throw new Error(msg);
  }
}

/** Removes backup files older than the retention period, always keeping the newest successful one. */
async function applyRetention(admin: Admin) {
  const { data: s } = await admin
    .from("platform_settings")
    .select("backup_retention_days")
    .single();
  const days = s?.backup_retention_days ?? 30;
  const { data: newest } = await admin
    .from("backup_runs")
    .select("id")
    .eq("status", "success")
    .order("started_at", { ascending: false })
    .limit(1);
  const { data: old } = await admin
    .from("backup_runs")
    .select("id, file_path")
    .eq("status", "success")
    .is("file_deleted_at", null)
    .lt("started_at", new Date(Date.now() - days * 86_400_000).toISOString());
  const drop = (old ?? []).filter((r) => r.id !== newest?.[0]?.id && r.file_path);
  if (!drop.length) return;
  const { error } = await admin.storage.from(BUCKET).remove(drop.map((r) => r.file_path!));
  if (!error)
    await admin
      .from("backup_runs")
      .update({ file_deleted_at: new Date().toISOString() })
      .in(
        "id",
        drop.map((r) => r.id),
      );
}

export async function backupDownloadUrl(admin: Admin, runId: string) {
  const { data } = await admin
    .from("backup_runs")
    .select("file_path, file_deleted_at, status")
    .eq("id", runId)
    .single();
  if (!data?.file_path || data.file_deleted_at || data.status !== "success")
    throw new Error("This backup file is not available");
  const { data: signed, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(data.file_path, 300, { download: true });
  if (error || !signed) throw new Error("Could not create a download link");
  return signed.signedUrl;
}

/**
 * Restores a verified backup. A fresh safety backup is taken first so the current state can be
 * restored again if needed; the database applies every row in one transaction or none at all.
 */
export async function restoreBackup(admin: Admin, runId: string, actor: string) {
  const { data: run } = await admin
    .from("backup_runs")
    .select("status, file_path, file_deleted_at, checksum, table_counts, started_at")
    .eq("id", runId)
    .maybeSingle();
  let text: string | null = null;
  if (run?.file_path && !run.file_deleted_at) {
    const dl = await admin.storage.from(BUCKET).download(run.file_path);
    text = dl.error || !dl.data ? null : await dl.data.text();
  }
  const check = await checkRestorable(
    run ? { ...run, table_counts: run.table_counts as Record<string, number> | null } : null,
    text,
  );
  if (!check.ok) throw new Error(check.error);

  const safety = await runBackup(admin, "manual", actor);
  const { data, error } = await admin.rpc("restore_platform_backup", {
    p_tables: check.tables as never,
    p_run_id: runId,
    p_actor: actor,
  });
  if (error) {
    console.error("restore failed", error.message);
    throw new Error(
      `Restore failed and nothing was changed: ${error.message.slice(0, 200)}. A safety backup was saved first.`,
    );
  }
  const tables = (data ?? {}) as Record<string, { restored: number; skipped: number }>;
  return {
    safetyBackupId: safety.id,
    restored: Object.values(tables).reduce((a, t) => a + (t.restored ?? 0), 0),
    skipped: Object.values(tables).reduce((a, t) => a + (t.skipped ?? 0), 0),
  };
}
