import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** School admin: link parent emails to students. Parents claim links after verifying that email. */
export function ParentLinksManager({ schoolId, canEdit }: { schoolId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const students = useQuery({
    queryKey: ["students", schoolId, "parent-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no")
        .eq("school_id", schoolId)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });
  const links = useQuery({
    queryKey: ["parent-links", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parent_links")
        .select("id, student_id, email, parent_id")
        .eq("school_id", schoolId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!studentId) {
      toast.error("Choose a student");
      return;
    }
    if (!EMAIL_RE.test(clean)) {
      toast.error("Enter a valid email address");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("parent_links")
      .insert({ school_id: schoolId, student_id: studentId, email: clean });
    setBusy(false);
    if (error) {
      toast.error(
        error.code === "23505" ? "That email is already linked to this student" : error.message,
      );
      return;
    }
    setEmail("");
    toast.success("Parent email added. They can now sign up or sign in with it.");
    qc.invalidateQueries({ queryKey: ["parent-links", schoolId] });
  }

  async function remove(id: string) {
    if (!confirm("Remove this parent's access to the student?")) return;
    const { error } = await supabase.from("parent_links").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["parent-links", schoolId] });
  }

  const nameOf = (id: string) => students.data?.find((s) => s.id === id);

  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        Add the email a parent will sign in with. Once they confirm that email, they see only the
        children linked here.
      </p>
      {canEdit && (
        <form onSubmit={add} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select
            aria-label="Student"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-64"
          >
            <option value="">Choose student…</option>
            {(students.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.admission_no})
              </option>
            ))}
          </select>
          <Input
            type="email"
            placeholder="parent@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="sm:w-72"
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add parent"}
          </Button>
        </form>
      )}
      <div className="mt-4 divide-y">
        {links.isLoading && <p className="py-2 text-sm text-muted-foreground">Loading…</p>}
        {links.data?.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">No parent emails yet.</p>
        )}
        {links.data?.map((l) => (
          <div
            key={l.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          >
            <span>
              <b>{nameOf(l.student_id)?.full_name ?? "Student"}</b> · {l.email}
            </span>
            <span className="flex items-center gap-3">
              <span className={l.parent_id ? "text-primary" : "text-muted-foreground"}>
                {l.parent_id ? "Linked" : "Waiting for parent"}
              </span>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => remove(l.id)}>
                  Remove
                </Button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
