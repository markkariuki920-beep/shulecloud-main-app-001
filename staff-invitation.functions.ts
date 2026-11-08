import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  schoolId: z.string().uuid(),
  email: z.string().trim().email().max(254),
  role: z.enum(["teacher", "bursar"]),
});

const htmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => htmlEscapes[c] ?? c);

/** Sends an invitation only after re-checking the signed-in user's school-admin role and pending invitation on the server. */
export const sendStaffInvitationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_school_role", {
      _user_id: context.userId,
      _school_id: data.schoolId,
      _role: "school_admin",
    });
    if (!allowed) throw new Error("Only this school's admin can send staff invitations");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from("staff_invitations")
      .select("id, email, role, expires_at, status")
      .eq("school_id", data.schoolId)
      .eq("email", email)
      .eq("role", data.role)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inviteError || !invitation) throw new Error("No matching active invitation was found");

    const { data: school, error: schoolError } = await supabaseAdmin
      .from("schools")
      .select("name")
      .eq("id", data.schoolId)
      .single();
    if (schoolError || !school) throw new Error("Could not load school details");

    const apiKey = process.env["RESEND_API_KEY"];
    const from = process.env["EMAIL_FROM"];
    const appUrl = process.env["APP_URL"]?.replace(/\/+$/, "");
    if (!apiKey || !from || !appUrl) {
      return { sent: false as const, reason: "not_configured" as const };
    }
    if (!appUrl.startsWith("https://")) {
      return { sent: false as const, reason: "invalid_app_url" as const };
    }

    const safeSchool = escapeHtml(school.name);
    const safeRole = escapeHtml(data.role);
    const expires = new Date(invitation.expires_at).toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Nairobi",
    });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Invitation to join ${school.name} on ShuleCloud`,
        text: `You have been invited to join ${school.name} on ShuleCloud as a ${data.role}. Open ${appUrl}/auth, sign in or create an account using this exact email address, and your invitation will appear on your dashboard. The invitation expires ${expires}. If you were not expecting this invitation, you can ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:560px;margin:auto"><h1>ShuleCloud staff invitation</h1><p>You have been invited to join <strong>${safeSchool}</strong> as a <strong>${safeRole}</strong>.</p><p><a href="${appUrl}/auth">Sign in or create your ShuleCloud account</a> using this exact email address. Your invitation will appear on your dashboard after sign-in.</p><p>This invitation expires ${escapeHtml(expires)} (East Africa Time).</p><p>If you were not expecting this invitation, you can ignore this email.</p></div>`,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const result = (await response.json().catch(() => ({}))) as { id?: string };
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      school_id: data.schoolId,
      action: response.ok ? "staff.invitation_email_sent" : "staff.invitation_email_failed",
      details: {
        invitation_id: invitation.id,
        provider: "resend",
        provider_message_id: result.id ?? null,
      },
    });
    if (!response.ok) return { sent: false as const, reason: "provider_error" as const };
    return { sent: true as const };
  });
