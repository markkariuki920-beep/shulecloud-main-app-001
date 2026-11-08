import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendStaffInvitationEmail } from "@/lib/staff-invitation.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type StaffRole = "teacher" | "bursar";
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export function StaffManager({ schoolId, canEdit }: { schoolId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const sendInviteEmail = useServerFn(sendStaffInvitationEmail);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("teacher");
  const [busy, setBusy] = useState(false);
  const [assign, setAssign] = useState({ teacher: "", cls: "", subject: "" });

  const staff = useQuery({
    queryKey: ["staff", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_school_staff", { _school_id: schoolId });
      if (error) throw error;
      return data ?? [];
    },
  });
  const invites = useQuery({
    queryKey: ["staff-invites", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invitations")
        .select("id, email, role, expires_at")
        .eq("school_id", schoolId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const classes = useQuery({
    queryKey: ["classes", schoolId, "staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, stream, class_teacher_id")
        .eq("school_id", schoolId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const subjects = useQuery({
    queryKey: ["subjects", schoolId, "staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("school_id", schoolId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const assignments = useQuery({
    queryKey: ["teacher-assignments", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_assignments")
        .select("id, teacher_id, class_id, subject_id")
        .eq("school_id", schoolId)
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    for (const k of ["staff", "staff-invites", "teacher-assignments"])
      qc.invalidateQueries({ queryKey: [k, schoolId] });
  };

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.rpc("invite_school_staff", {
      _school_id: schoolId,
      _email: normalizedEmail,
      _role: role,
    });
    if (error) {
      setBusy(false);
      toast.error(
        error.message.includes("staff_invitation_pending_email")
          ? "This email already has a pending invite."
          : error.message,
      );
      return;
    }
    try {
      const delivery = await sendInviteEmail({ data: { schoolId, email: normalizedEmail, role } });
      if (delivery.sent) toast.success(`Invitation emailed to ${normalizedEmail}.`);
      else
        toast.warning(
          `Invitation created, but email was not sent (${delivery.reason}). Ask them to sign in with ${normalizedEmail}; the invite will appear on their dashboard.`,
        );
    } catch {
      toast.warning(
        `Invitation created, but email delivery could not be confirmed. Ask them to sign in with ${normalizedEmail}; the invite will appear on their dashboard.`,
      );
    } finally {
      setBusy(false);
    }
    setEmail("");
    refresh();
  }

  async function cancelInvite(id: string) {
    const { error } = await supabase.rpc("cancel_staff_invitation", { _invitation_id: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invite cancelled");
    refresh();
  }

  async function changeRole(userId: string, newRole: StaffRole | null) {
    if (newRole === null && !confirm("Remove this person's access to the school?")) return;
    const { error } = await supabase.rpc("change_school_staff_role", {
      _school_id: schoolId,
      _user_id: userId,
      ...(newRole ? { _role: newRole } : {}),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(newRole ? "Role updated" : "Access removed");
    refresh();
  }

  async function addAssignment(e: React.FormEvent) {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("teacher_assignments").upsert(
      {
        school_id: schoolId,
        teacher_id: assign.teacher,
        class_id: assign.cls,
        subject_id: assign.subject,
        is_active: true,
        created_by: u.user!.id,
      },
      { onConflict: "school_id,teacher_id,class_id,subject_id" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Teacher assigned");
    setAssign({ ...assign, cls: "", subject: "" });
    refresh();
  }

  async function setClassTeacher(classId: string, teacherId: string) {
    const { error } = await supabase
      .from("classes")
      .update({
        class_teacher_id: teacherId || null,
      })
      .eq("id", classId)
      .eq("school_id", schoolId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(teacherId ? "Class teacher assigned" : "Class teacher removed");
    qc.invalidateQueries({ queryKey: ["classes", schoolId] });
    qc.invalidateQueries({ queryKey: ["classes", schoolId, "staff"] });
  }

  async function removeAssignment(id: string) {
    const { error } = await supabase
      .from("teacher_assignments")
      .update({ is_active: false })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  const teachers = (staff.data ?? []).filter((s) => s.role === "teacher");
  const nameOf = (id: string) => {
    const s = staff.data?.find((x) => x.user_id === id);
    return s?.full_name || s?.email || "Unknown";
  };
  const className = (id: string) => {
    const c = classes.data?.find((x) => x.id === id);
    return c ? `${c.name}${c.stream ? ` ${c.stream}` : ""}` : "—";
  };
  const subjectName = (id: string) => subjects.data?.find((x) => x.id === id)?.name ?? "—";

  return (
    <div className="space-y-8">
      {canEdit && (
        <form
          onSubmit={invite}
          className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end"
        >
          <div className="space-y-1">
            <Label htmlFor="invite-email">Email address *</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@example.com"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-role">Role *</Label>
            <select
              id="invite-role"
              className={selectCls}
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
            >
              <option value="teacher">Teacher</option>
              <option value="bursar">Bursar</option>
            </select>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Inviting…" : "Invite"}
          </Button>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            The person can accept from their dashboard after signing in with this exact email. If
            email is configured, ShuleCloud sends the invitation; invites expire after 7 days.
          </p>
        </form>
      )}

      <section>
        <h3 className="mb-2 font-semibold">Pending invites</h3>
        {invites.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : invites.error ? (
          <p className="text-sm text-destructive">Couldn't load invites.</p>
        ) : invites.data!.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {invites.data!.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>
                  {i.email} · <span className="capitalize">{i.role}</span> · expires{" "}
                  {new Date(i.expires_at).toLocaleDateString()}
                </span>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => cancelInvite(i.id)}>
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Staff</h3>
        {staff.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : staff.error ? (
          <p className="text-sm text-destructive">Couldn't load staff.</p>
        ) : staff.data!.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teachers or bursars yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {staff.data!.map((s) => (
              <li
                key={s.user_id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>
                  <strong>{s.full_name || s.email}</strong>
                  {s.full_name && <span className="text-muted-foreground"> · {s.email}</span>}
                </span>
                <div className="flex items-center gap-2">
                  {canEdit ? (
                    <select
                      aria-label={`Role for ${s.email}`}
                      className={`${selectCls} w-32`}
                      value={s.role}
                      onChange={(e) => changeRole(s.user_id, e.target.value as StaffRole)}
                    >
                      <option value="teacher">Teacher</option>
                      <option value="bursar">Bursar</option>
                    </select>
                  ) : (
                    <span className="capitalize">{s.role}</span>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => changeRole(s.user_id, null)}>
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Class teacher assignments</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Each class can have one class teacher. The same teacher can also be assigned subjects
          below.
        </p>
        <ul className="divide-y rounded-xl border bg-card">
          {(classes.data ?? []).map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
            >
              <strong>
                {c.name}
                {c.stream ? ` ${c.stream}` : ""}
              </strong>
              {canEdit ? (
                <select
                  aria-label={`Class teacher for ${c.name}`}
                  className={`${selectCls} max-w-xs`}
                  value={c.class_teacher_id ?? ""}
                  onChange={(e) => void setClassTeacher(c.id, e.target.value)}
                >
                  <option value="">No class teacher</option>
                  {teachers.map((t) => (
                    <option key={t.user_id} value={t.user_id}>
                      {t.full_name || t.email}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{c.class_teacher_id ? nameOf(c.class_teacher_id) : "Not assigned"}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Teacher classes and subjects</h3>
        {canEdit && teachers.length > 0 && (
          <form
            onSubmit={addAssignment}
            className="mb-3 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4 sm:items-end"
          >
            <div className="space-y-1">
              <Label htmlFor="as-teacher">Teacher</Label>
              <select
                id="as-teacher"
                required
                className={selectCls}
                value={assign.teacher}
                onChange={(e) => setAssign({ ...assign, teacher: e.target.value })}
              >
                <option value="">Choose…</option>
                {teachers.map((t) => (
                  <option key={t.user_id} value={t.user_id}>
                    {t.full_name || t.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="as-class">Class</Label>
              <select
                id="as-class"
                required
                className={selectCls}
                value={assign.cls}
                onChange={(e) => setAssign({ ...assign, cls: e.target.value })}
              >
                <option value="">Choose…</option>
                {classes.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.stream ? ` ${c.stream}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="as-subject">Subject</Label>
              <select
                id="as-subject"
                required
                className={selectCls}
                value={assign.subject}
                onChange={(e) => setAssign({ ...assign, subject: e.target.value })}
              >
                <option value="">Choose…</option>
                {subjects.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Assign</Button>
          </form>
        )}
        {teachers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Invite a teacher first, then assign classes and subjects.
          </p>
        ) : (assignments.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {assignments.data!.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>
                  {nameOf(a.teacher_id)} · {className(a.class_id)} · {subjectName(a.subject_id)}
                </span>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => removeAssignment(a.id)}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function MyInvitations() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-invitations"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_staff_invitations");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function accept(id: string) {
    const { error } = await supabase.rpc("accept_staff_invitation", { _invitation_id: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome aboard!");
    qc.invalidateQueries();
  }

  if (!q.data || q.data.length === 0) return null;
  return (
    <div className="mb-6 space-y-3">
      {q.data.map((i) => (
        <div
          key={i.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary bg-card p-4"
        >
          <p className="text-sm">
            <strong>{i.school_name}</strong> invited you to join as a{" "}
            <span className="capitalize">{i.role}</span>.
          </p>
          <Button size="sm" onClick={() => accept(i.id)}>
            Accept invite
          </Button>
        </div>
      ))}
    </div>
  );
}
