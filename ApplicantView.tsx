import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "./StatusBadge";

const schema = z.object({
  school_name: z.string().trim().min(2).max(150),
  level: z.enum(["primary", "secondary", "college"]),
  county: z.string().trim().min(2).max(60),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{9,20}$/, "Enter a valid phone number"),
  email: z.string().trim().email().max(255),
  student_estimate: z.coerce.number().int().min(0).max(100000),
});

export function ApplicantView({ userId, email }: { userId: string; email: string }) {
  const qc = useQueryClient();
  const apps = useQuery({
    queryKey: ["my-apps", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_applications")
        .select("*")
        .eq("applicant_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState({
    school_name: "",
    level: "primary",
    county: "",
    phone: "",
    email,
    student_estimate: "",
  });
  const [busy, setBusy] = useState(false);

  const pending = apps.data?.find((a) => a.status === "pending");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    const { error } = await supabase
      .from("school_applications")
      .insert({ ...parsed.data, applicant_id: userId });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Application submitted");
    qc.invalidateQueries({ queryKey: ["my-apps", userId] });
  }

  if (apps.isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Register your school</h1>
      <p className="mt-1 text-muted-foreground">
        Once approved, your school gets a 5-day free trial.
      </p>

      {apps.data?.map((a) => (
        <div key={a.id} className="mt-4 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{a.school_name}</span>
            <StatusBadge status={a.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitted {new Date(a.created_at).toLocaleString()}
          </p>
          {a.review_note && <p className="mt-2 text-sm">Note: {a.review_note}</p>}
        </div>
      ))}

      {!pending && (
        <form
          onSubmit={submit}
          className="mt-6 space-y-4 rounded-xl border bg-card p-6 shadow-elegant"
        >
          <Field
            label="School name"
            value={form.school_name}
            onChange={(v) => setForm({ ...form, school_name: v })}
          />
          <div className="space-y-1.5">
            <Label>Level</Label>
            <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="secondary">Secondary / High school</SelectItem>
                <SelectItem value="college">College</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field
            label="County"
            value={form.county}
            onChange={(v) => setForm({ ...form, county: v })}
          />
          <Field
            label="School phone"
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
            placeholder="0712 345 678"
          />
          <Field
            label="School email"
            type="email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
          />
          <Field
            label="Approx. number of students"
            type="number"
            value={form.student_estimate}
            onChange={(v) => setForm({ ...form, student_estimate: v })}
          />
          <Button className="w-full" disabled={busy}>
            {busy ? "Submitting…" : "Submit application"}
          </Button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        required
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
