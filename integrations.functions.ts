import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeKePhone } from "./mpesa";

type Ctx = {
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "super_admin" },
    ) => PromiseLike<{ data: boolean | null }>;
  };
  userId: string;
};

async function requireSuperAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (!data) throw new Error("Only the Super Admin can do this");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const providerSchema = z.enum(["mpesa", "sms"]);
const str = (max = 200) => z.string().trim().max(max).optional();

export const getIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireSuperAdmin(context);
    const srv = await import("./integrations.server");
    const keyReady = !!process.env["INTEGRATIONS_ENCRYPTION_KEY"];
    const out: Record<string, unknown> = { keyReady };
    for (const p of ["mpesa", "sms"] as const) {
      const s = await srv.loadSettings<Record<string, unknown>, Record<string, string>>(admin, p);
      out[p] = {
        enabled: s.enabled,
        config: s.config,
        hints: (s.row?.secret_hints ?? {}) as Record<string, string>,
        verifiedAt: s.row?.verified_at ?? null,
        lastCheck: s.row?.last_check ?? null,
        updatedAt: s.row?.updated_at ?? null,
        missing: srv.missingFields(p, s.config, s.secrets),
      };
    }
    return out as {
      keyReady: boolean;
      mpesa: IntegrationView;
      sms: IntegrationView;
    };
  });

export type IntegrationView = {
  enabled: boolean;
  config: Record<string, string>;
  hints: Record<string, string>;
  verifiedAt: string | null;
  lastCheck: string | null;
  updatedAt: string | null;
  missing: string[];
};

const saveSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("mpesa"),
    config: z.object({
      environment: z.enum(["sandbox", "production"]),
      shortcode: z
        .string()
        .trim()
        .regex(/^\d{5,8}$/, "Shortcode must be 5-8 digits"),
      transaction_type: z.enum(["CustomerPayBillOnline", "CustomerBuyGoodsOnline"]),
      party_b: z
        .string()
        .trim()
        .regex(/^\d{0,8}$/, "Till/store number must be digits")
        .optional(),
      account_reference: str(12),
      callback_base_url: z
        .string()
        .trim()
        .url()
        .refine((u) => u.startsWith("https://"), "Callback address must start with https://"),
    }),
    secrets: z.object({ consumer_key: str(200), consumer_secret: str(200), passkey: str(300) }),
  }),
  z.object({
    provider: z.literal("sms"),
    config: z.object({
      provider: z.enum(["africastalking", "twilio"]),
      environment: z.enum(["sandbox", "production"]),
      username: str(100),
      sender_id: str(11),
      account_sid: str(64),
      from_number: str(20),
    }),
    secrets: z.object({ api_key: str(300), auth_token: str(200) }),
  }),
]);

/** Saves settings. Blank credential fields keep the saved value. Any change switches the provider off until it is re-tested. */
export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireSuperAdmin(context);
    const srv = await import("./integrations.server");
    const cur = await srv.loadSettings<Record<string, unknown>, Record<string, string>>(
      admin,
      data.provider,
    );
    const secrets: Record<string, string> = { ...cur.secrets };
    const changed: string[] = [];
    for (const [k, v] of Object.entries(data.secrets))
      if (v) {
        secrets[k] = v;
        changed.push(k);
      }
    if (data.provider === "mpesa" && data.config.environment === "production") {
      const appUrl = process.env["APP_URL"]?.trim().replace(/\/+$/, "");
      let callbackMatchesApp = false;
      try {
        const callbackUrl = new URL(data.config.callback_base_url);
        const configuredApp = appUrl ? new URL(appUrl) : null;
        callbackMatchesApp =
          !!configuredApp &&
          configuredApp.protocol === "https:" &&
          configuredApp.origin === appUrl &&
          callbackUrl.origin === appUrl &&
          callbackUrl.pathname === "/" &&
          !callbackUrl.search &&
          !callbackUrl.hash;
      } catch {
        /* validated by schema; invalid production URLs are rejected below */
      }
      if (!callbackMatchesApp)
        throw new Error(
          "Production M-Pesa callbacks must use the published HTTPS APP_URL origin without a path or query string",
        );
      if (!secrets["consumer_key"] || !secrets["consumer_secret"] || !secrets["passkey"])
        throw new Error("Production M-Pesa credentials are incomplete");
    }
    if (data.provider === "mpesa" && !secrets["callback_token"])
      secrets["callback_token"] =
        crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error } = await admin.from("integration_settings").upsert({
      provider: data.provider,
      enabled: false,
      verified_at: null,
      config: data.config,
      secrets_encrypted: await srv.encryptJson(secrets),
      secret_hints: srv.hintsFor(secrets, data.provider),
      last_check: "Saved. Test the connection before switching it on.",
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Could not save settings");
    await admin.from("audit_logs").insert({
      actor_id: context.userId,
      action: `integration.${data.provider}_updated`,
      details: { credentials_replaced: changed },
    });
    return { missing: srv.missingFields(data.provider, data.config, secrets) };
  });

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ provider: providerSchema, phone: z.string().max(20).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireSuperAdmin(context);
    const srv = await import("./integrations.server");
    const s = await srv.loadSettings<Record<string, string>, Record<string, string>>(
      admin,
      data.provider,
    );
    const missing = srv.missingFields(data.provider, s.config, s.secrets);
    if (missing.length) return { ok: false, message: `Fill in: ${missing.join(", ")}` };
    let ok = false;
    let message = "";
    if (data.provider === "mpesa") {
      try {
        await srv.darajaToken(s.config as never, s.secrets);
        ok = true;
        message = `Connected to Safaricom (${s.config["environment"]}).`;
      } catch (e) {
        message = (e as Error).message;
      }
    } else {
      const phone = normalizeKePhone(data.phone ?? "");
      if (!phone)
        return { ok: false, message: "Enter a valid Kenyan mobile number to receive the test SMS" };
      const body = "ShuleCloud test message. SMS sending is set up correctly.";
      const r = await srv.sendSms(s.config as never, s.secrets, phone, body);
      ok = r.ok;
      message = r.ok
        ? `Test SMS accepted by the provider for ${phone}. Check the phone to confirm it arrived.`
        : r.error;
      await admin.from("sms_messages").insert({
        to_phone: phone,
        body,
        kind: "test",
        status: r.ok ? "sent" : "failed",
        attempts: 1,
        provider: String(s.config["provider"]),
        provider_message_id: r.ok ? r.id : null,
        last_error: r.ok ? null : r.error.slice(0, 300),
        sent_at: r.ok ? new Date().toISOString() : null,
      });
    }
    await admin
      .from("integration_settings")
      .update({
        verified_at: ok ? new Date().toISOString() : null,
        last_check:
          `${new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}: ${message}`.slice(
            0,
            300,
          ),
        ...(ok ? {} : { enabled: false }),
      })
      .eq("provider", data.provider);
    return { ok, message };
  });

export const setIntegrationEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ provider: providerSchema, enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireSuperAdmin(context);
    const srv = await import("./integrations.server");
    const s = await srv.loadSettings<Record<string, unknown>, Record<string, string>>(
      admin,
      data.provider,
    );
    if (data.enabled) {
      if (srv.missingFields(data.provider, s.config, s.secrets).length)
        throw new Error("Fill in all required settings first");
      if (!s.verified) throw new Error("Run a successful test first");
    }
    await admin
      .from("integration_settings")
      .update({
        enabled: data.enabled,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", data.provider);
    await admin.from("audit_logs").insert({
      actor_id: context.userId,
      action: `integration.${data.provider}_${data.enabled ? "enabled" : "disabled"}`,
      details: {},
    });
    return { ok: true };
  });

export const processSmsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireSuperAdmin(context);
    const srv = await import("./integrations.server");
    return srv.processSmsQueue(admin);
  });

// ---------- M-Pesa for School Admins ----------
export const startMpesaPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        schoolId: z.string().uuid(),
        months: z.number().int().min(1).max(12),
        phone: z.string().max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_school_role", {
      _user_id: context.userId,
      _school_id: data.schoolId,
      _role: "school_admin",
    });
    if (!isAdmin) throw new Error("Only the school admin can pay for this school");
    const phone = normalizeKePhone(data.phone);
    if (!phone) throw new Error("Enter a valid M-Pesa number, e.g. 0712345678");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const srv = await import("./integrations.server");
    const s = await srv.loadSettings<
      import("./integrations.server").MpesaConfig,
      import("./integrations.server").MpesaSecrets
    >(admin, "mpesa");
    if (!s.enabled || !s.verified)
      throw new Error(
        "M-Pesa prompt payments are not switched on yet. Use the manual payment form below.",
      );

    const { data: recent } = await admin
      .from("mpesa_transactions")
      .select("id")
      .eq("school_id", data.schoolId)
      .eq("status", "pending")
      .gt("created_at", new Date(Date.now() - 2 * 60_000).toISOString())
      .limit(1);
    if (recent?.length)
      throw new Error(
        "A payment prompt was just sent. Complete it on your phone or wait 2 minutes.",
      );

    const { data: school } = await admin
      .from("schools")
      .select("level")
      .eq("id", data.schoolId)
      .single();
    const { data: plan } = await admin
      .from("subscription_plans")
      .select("monthly_price")
      .eq("level", school!.level)
      .single();
    if (!plan) throw new Error("No plan for this school");
    const amount = Number(plan.monthly_price) * data.months;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 250_000_000) {
      throw new Error("The calculated subscription amount is invalid. Contact ShuleCloud support.");
    }

    const { data: tx, error } = await admin
      .from("mpesa_transactions")
      .insert({
        school_id: data.schoolId,
        months: data.months,
        amount,
        phone,
        environment: s.config.environment,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !tx) throw new Error("Could not start the payment");
    try {
      const r = await srv.stkPush(s.config, s.secrets, {
        phone,
        amount,
        account: s.config.account_reference || "ShuleCloud",
        txId: tx.id,
      });
      const { error: updateError } = await admin
        .from("mpesa_transactions")
        .update({
          checkout_request_id: r.checkoutRequestId,
          merchant_request_id: r.merchantRequestId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tx.id);
      if (updateError) {
        // Keep a record of the provider request, but never tell the user the flow is ready
        // when the callback cannot be matched to the stored checkout request.
        await admin.rpc("complete_mpesa_payment", {
          _tx_id: tx.id,
          _status: "failed",
          _result_code: "",
          _result_desc: "Could not save the Safaricom checkout reference",
          _receipt: "",
          _paid_amount: null as never,
        });
        throw new Error(
          "Safaricom accepted the prompt but ShuleCloud could not save its reference. Check the transaction before retrying.",
        );
      }
      return { txId: tx.id, message: r.customerMessage, amount };
    } catch (e) {
      const msg = (e as Error).message;
      await admin.rpc("complete_mpesa_payment", {
        _tx_id: tx.id,
        _status: "failed",
        _result_code: "",
        _result_desc: msg,
        _receipt: "",
        _paid_amount: null as never,
      });
      throw new Error(`M-Pesa could not send the prompt: ${msg}`);
    }
  });

export const checkMpesaPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ txId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: the caller only sees transactions of a school they administer.
    const { data: tx } = await context.supabase
      .from("mpesa_transactions")
      .select("id, status, created_at")
      .eq("id", data.txId)
      .maybeSingle();
    if (!tx) throw new Error("Payment not found");
    if (tx.status === "pending" && Date.now() - new Date(tx.created_at).getTime() > 25_000) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const srv = await import("./integrations.server");
      await srv.resolvePendingMpesa(supabaseAdmin, tx.id);
    }
    const { data: now } = await context.supabase
      .from("mpesa_transactions")
      .select("status, result_desc, mpesa_receipt")
      .eq("id", data.txId)
      .single();
    return now!;
  });

export const mpesaAvailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("mpesa_stk_available");
    return { available: !!data };
  });

// ---------- Backups ----------
export const runBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireSuperAdmin(context);
    const srv = await import("./integrations.server");
    return srv.runBackup(admin, "manual", context.userId);
  });

export const getBackupDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireSuperAdmin(context);
    const srv = await import("./integrations.server");
    const url = await srv.backupDownloadUrl(admin, data.runId);
    await admin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "backup.downloaded",
      details: { run_id: data.runId },
    });
    return { url };
  });

export const restoreBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ runId: z.string().uuid(), confirm: z.literal("RESTORE") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireSuperAdmin(context);
    const srv = await import("./integrations.server");
    return srv.restoreBackup(admin, data.runId, context.userId);
  });

const driveFrequencySchema = z.enum(["daily", "every_3_days", "weekly", "manual"]);
export const getSchoolDriveBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const drive = await import("./google-drive-backup.server");
    return drive.getSchoolDriveStatus(data.schoolId, context.userId);
  });
export const connectSchoolGoogleDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const drive = await import("./google-drive-backup.server");
    return { url: await drive.createGoogleConnectUrl(data.schoolId, context.userId) };
  });
export const saveSchoolDriveBackupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        schoolId: z.string().uuid(),
        frequency: driveFrequencySchema,
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const drive = await import("./google-drive-backup.server");
    return drive.saveSchoolDriveSettings(
      data.schoolId,
      context.userId,
      data.frequency,
      data.enabled,
    );
  });
export const runSchoolDriveBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_school_role", {
      _user_id: context.userId,
      _school_id: data.schoolId,
      _role: "school_admin",
    });
    if (!isAdmin) throw new Error("Only this school's admin can run a school backup");
    const drive = await import("./google-drive-backup.server");
    return drive.runSchoolDriveBackup(data.schoolId, "manual");
  });
