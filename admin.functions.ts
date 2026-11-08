import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Grants the single platform Super Admin role to the signed-in user only when
 * their verified email matches the protected SUPER_ADMIN_EMAIL setting and no
 * other account already holds the role.
 */
export const claimSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const configured = process.env["SUPER_ADMIN_EMAIL"]?.trim().toLowerCase();
    const email = (context.claims.email as string | undefined)?.trim().toLowerCase();
    if (!configured || !email || email !== configured) return { granted: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Supabase access tokens do not consistently expose an `email_verified`
    // claim. Check the authoritative Auth user record server-side instead of
    // relying on a non-standard JWT claim that could prevent legitimate setup.
    const { data: authUserResult, error: authUserError } =
      await supabaseAdmin.auth.admin.getUserById(context.userId);
    const authUser = authUserResult.user;
    if (
      authUserError ||
      !authUser ||
      !authUser.email_confirmed_at ||
      authUser.email?.trim().toLowerCase() !== configured
    ) {
      return { granted: false };
    }

    const { data: existing, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin");
    if (error) throw new Error(error.message);
    if (existing.some((r) => r.user_id !== context.userId)) return { granted: false };
    if (existing.length === 0) {
      const { error: insErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: context.userId, role: "super_admin", school_id: null });
      // A unique database index is the concurrency guard. Two simultaneous
      // first-time claims can both observe an empty table; only one insert may
      // win. Treat the losing unique-violation as a denied claim, not a 500.
      if (insErr) {
        if (insErr.code === "23505") return { granted: false };
        throw new Error(insErr.message);
      }
      const { error: auditError } = await supabaseAdmin
        .from("audit_logs")
        .insert({ actor_id: context.userId, action: "super_admin.claimed", details: {} });
      if (auditError) {
        // The role grant has already committed; log failure without pretending
        // the claim failed and encouraging a duplicate claim attempt.
        console.error("Failed to write Super Admin claim audit log", auditError.message);
      }
    }
    return { granted: true };
  });
