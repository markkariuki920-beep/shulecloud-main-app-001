import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Table = "students" | "classes" | "subjects" | "academic_years" | "terms";
type Field = {
  key: string;
  label: string;
  type?: "text" | "date" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
};
type Row = Record<string, unknown> & { id: string };

function useRows(table: Table, schoolId: string, order: string) {
  return useQuery({
    // Third key part avoids sharing a cache entry with narrower lists elsewhere; [table, schoolId] invalidation still refreshes all of them.
    queryKey: [table, schoolId, "setup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("school_id", schoolId)
        .order(order);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
}

function Manager({
  table,
  schoolId,
  canEdit,
  fields,
  rows,
  columns,
}: {
  table: Table;
  schoolId: string;
  canEdit: boolean;
  fields: Field[];
  rows: Row[];
  columns: { label: string; render: (r: Row) => string }[];
}) {
  const qc = useQueryClient();
  const empty = Object.fromEntries(fields.map((f) => [f.key, ""]));
  const [form, setForm] = useState<Record<string, string>>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit(row: Row) {
    const values: Record<string, string> = {};
    for (const field of fields) {
      const value = row[field.key];
      const text = value == null ? "" : String(value);
      values[field.key] = field.type === "date" ? text.slice(0, 10) : text;
    }
    setForm(values);
    setEditingId(row.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(empty);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload: Record<string, unknown> = {};
    for (const f of fields) payload[f.key] = form[f.key]?.trim() || null;
    const result = editingId
      ? await supabase
          .from(table)
          .update(payload as never)
          .eq("id", editingId)
          .eq("school_id", schoolId)
      : await supabase.from(table).insert({ ...payload, school_id: schoolId } as never);
    setBusy(false);
    if (result.error) {
      toast.error(
        result.error.message.includes("duplicate")
          ? "That entry already exists."
          : result.error.message,
      );
      return;
    }
    toast.success(editingId ? "Changes saved" : "Entry added");
    cancelEdit();
    qc.invalidateQueries({ queryKey: [table, schoolId] });
  }

  async function remove(id: string) {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: [table, schoolId] });
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <form onSubmit={add} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`${table}-${f.key}`}>
                {f.label}
                {f.required && " *"}
              </Label>
              {f.type === "select" ? (
                <select
                  id={`${table}-${f.key}`}
                  required={f.required}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`${table}-${f.key}`}
                  type={f.type ?? "text"}
                  required={f.required}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Add"}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={cancelEdit} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing added yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                {columns.map((c) => (
                  <th key={c.label} className="px-3 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  {columns.map((c) => (
                    <td key={c.label} className="px-3 py-2">
                      {c.render(r) || "—"}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = (k: string) => (r: Row) => (r[k] == null ? "" : String(r[k]));

export function SchoolSetup({ schoolId, canEdit }: { schoolId: string; canEdit: boolean }) {
  const classes = useRows("classes", schoolId, "name");
  const subjects = useRows("subjects", schoolId, "name");
  const years = useRows("academic_years", schoolId, "starts_on");
  const terms = useRows("terms", schoolId, "starts_on");
  const students = useRows("students", schoolId, "admission_no");

  const classOpts = (classes.data ?? []).map((c) => ({
    value: c.id,
    label: [c["name"], c["stream"]].filter(Boolean).join(" "),
  }));
  const yearOpts = (years.data ?? []).map((y) => ({ value: y.id, label: String(y["name"]) }));
  const className = (id: unknown) => classOpts.find((o) => o.value === id)?.label ?? "";
  const yearName = (id: unknown) => yearOpts.find((o) => o.value === id)?.label ?? "";

  return (
    <Tabs defaultValue="students" className="mt-8">
      <TabsList className="flex-wrap">
        <TabsTrigger value="students">Students</TabsTrigger>
        <TabsTrigger value="classes">Classes</TabsTrigger>
        <TabsTrigger value="subjects">Subjects</TabsTrigger>
        <TabsTrigger value="years">Years & terms</TabsTrigger>
        <TabsTrigger value="staff">Staff</TabsTrigger>
      </TabsList>
      <TabsContent value="students" className="mt-4">
        <Manager
          table="students"
          schoolId={schoolId}
          canEdit={canEdit}
          rows={students.data ?? []}
          fields={[
            { key: "admission_no", label: "Admission no.", required: true },
            { key: "full_name", label: "Full name", required: true },
            {
              key: "gender",
              label: "Gender",
              type: "select",
              options: [
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
              ],
            },
            { key: "date_of_birth", label: "Date of birth", type: "date" },
            { key: "class_id", label: "Class", type: "select", options: classOpts },
            { key: "guardian_name", label: "Guardian name" },
            { key: "guardian_phone", label: "Guardian phone" },
          ]}
          columns={[
            { label: "Adm no.", render: s("admission_no") },
            { label: "Name", render: s("full_name") },
            { label: "Class", render: (r) => className(r["class_id"]) },
            { label: "Guardian", render: s("guardian_name") },
            { label: "Phone", render: s("guardian_phone") },
          ]}
        />
      </TabsContent>
      <TabsContent value="classes" className="mt-4">
        <Manager
          table="classes"
          schoolId={schoolId}
          canEdit={canEdit}
          rows={classes.data ?? []}
          fields={[
            { key: "name", label: "Class (e.g. Grade 4, Form 2)", required: true },
            { key: "stream", label: "Stream (e.g. East)" },
          ]}
          columns={[
            { label: "Class", render: s("name") },
            { label: "Stream", render: s("stream") },
          ]}
        />
      </TabsContent>
      <TabsContent value="subjects" className="mt-4">
        <Manager
          table="subjects"
          schoolId={schoolId}
          canEdit={canEdit}
          rows={subjects.data ?? []}
          fields={[
            { key: "name", label: "Subject", required: true },
            { key: "code", label: "Code" },
          ]}
          columns={[
            { label: "Subject", render: s("name") },
            { label: "Code", render: s("code") },
          ]}
        />
      </TabsContent>
      <TabsContent value="years" className="mt-4 space-y-8">
        <section>
          <h3 className="mb-3 font-display font-semibold">Academic years</h3>
          <Manager
            table="academic_years"
            schoolId={schoolId}
            canEdit={canEdit}
            rows={years.data ?? []}
            fields={[
              { key: "name", label: "Name (e.g. 2026)", required: true },
              { key: "starts_on", label: "Starts", type: "date", required: true },
              { key: "ends_on", label: "Ends", type: "date", required: true },
            ]}
            columns={[
              { label: "Year", render: s("name") },
              { label: "Starts", render: s("starts_on") },
              { label: "Ends", render: s("ends_on") },
            ]}
          />
        </section>
        <section>
          <h3 className="mb-3 font-display font-semibold">Terms</h3>
          <Manager
            table="terms"
            schoolId={schoolId}
            canEdit={canEdit}
            rows={terms.data ?? []}
            fields={[
              {
                key: "academic_year_id",
                label: "Academic year",
                type: "select",
                required: true,
                options: yearOpts,
              },
              { key: "name", label: "Term (e.g. Term 1)", required: true },
              { key: "starts_on", label: "Starts", type: "date", required: true },
              { key: "ends_on", label: "Ends", type: "date", required: true },
            ]}
            columns={[
              { label: "Year", render: (r) => yearName(r["academic_year_id"]) },
              { label: "Term", render: s("name") },
              { label: "Starts", render: s("starts_on") },
              { label: "Ends", render: s("ends_on") },
            ]}
          />
        </section>
      </TabsContent>
      <TabsContent value="staff" className="mt-4">
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Invite teachers and bursars in the Staff section further down this page.
        </div>
      </TabsContent>
    </Tabs>
  );
}
