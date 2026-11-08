import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { balances, ksh } from "@/lib/finance";
import { gradeFor } from "@/lib/grading";
import { downloadCsv, toCsv, printTable } from "@/lib/csv";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

/** Parent dashboard. Every read is limited server-side to linked children (is_parent_of policies). */
export function ParentView() {
  const kids = useQuery({
    queryKey: ["my-children"],
    queryFn: async () => {
      const { data: links, error } = await supabase.from("parent_links").select("student_id");
      if (error) throw error;
      const ids = links.map((l) => l.student_id);
      if (!ids.length) return [];
      const { data, error: e2 } = await supabase
        .from("students")
        .select("id, full_name, admission_no, school_id, class_id")
        .in("id", ids)
        .order("full_name");
      if (e2) throw e2;
      return data;
    },
  });
  const [sel, setSel] = useState("");
  const child = kids.data?.find((k) => k.id === sel) ?? kids.data?.[0];

  if (kids.isLoading) return <p className="text-muted-foreground">Loading your children…</p>;
  if (kids.error)
    return (
      <p className="text-destructive">
        Couldn't load your children: {(kids.error as Error).message}
      </p>
    );
  if (!child)
    return (
      <div className="rounded-xl border bg-card p-6">
        <h1 className="text-xl font-bold">No children linked yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask your school to add this email address to your child's record, then sign in again.
        </p>
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl shadow-md">
        <div className="bg-[#102A43] px-5 py-3 text-sm font-semibold text-white">
          ShuleCloud · Parent Portal
        </div>
        <div className="bg-gradient-to-r from-[#102A43] via-[#164E78] to-[#087EAA] p-5 text-white sm:p-7">
          <p className="text-sm font-medium text-cyan-100">Your family workspace</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">My children</h1>
          <p className="mt-2 text-sm text-slate-100">
            View learning progress, attendance, fee balances and receipts in one place.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <a
              className="rounded-lg bg-white/15 px-3 py-2 hover:bg-white/25"
              href="#parent-results"
            >
              Exam results
            </a>
            <a
              className="rounded-lg bg-white/15 px-3 py-2 hover:bg-white/25"
              href="#parent-attendance"
            >
              Attendance
            </a>
            <a className="rounded-lg bg-white/15 px-3 py-2 hover:bg-white/25" href="#parent-fees">
              Fees & payments
            </a>
          </div>
        </div>
      </div>
      {kids.data!.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {kids.data!.map((k) => (
            <button
              key={k.id}
              onClick={() => setSel(k.id)}
              className={`rounded-full border px-4 py-1.5 text-sm ${k.id === child.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
            >
              {k.full_name}
            </button>
          ))}
        </div>
      )}
      <ChildDetail key={child.id} child={child} />
    </div>
  );
}

type Child = {
  id: string;
  full_name: string;
  admission_no: string;
  school_id: string;
  class_id: string | null;
};

function ChildDetail({ child }: { child: Child }) {
  const q = useQuery({
    queryKey: ["child-detail", child.id],
    queryFn: async () => {
      const [school, cls, inv, pay, att, marks, exams, subjects, bands] = await Promise.all([
        supabase.from("schools").select("name").eq("id", child.school_id).maybeSingle(),
        child.class_id
          ? supabase.from("classes").select("name, stream").eq("id", child.class_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("invoices")
          .select("student_id, amount, description, created_at")
          .eq("student_id", child.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("payments")
          .select("student_id, amount, method, reference, paid_on, receipt_no")
          .eq("student_id", child.id)
          .order("paid_on", { ascending: false }),
        supabase
          .from("attendance")
          .select("on_date, status")
          .eq("student_id", child.id)
          .order("on_date", { ascending: false })
          .limit(60),
        supabase.from("exam_marks").select("exam_id, subject_id, score").eq("student_id", child.id),
        supabase
          .from("exams")
          .select("id, name, max_score, created_at")
          .eq("school_id", child.school_id)
          .order("created_at", { ascending: false }),
        supabase.from("subjects").select("id, name").eq("school_id", child.school_id),
        supabase.from("grade_bands").select("grade, min_score").eq("school_id", child.school_id),
      ]);
      for (const r of [school, cls, inv, pay, att, marks, exams, subjects, bands])
        if (r.error) throw r.error;
      return {
        school: school.data,
        cls: cls.data,
        inv: inv.data ?? [],
        pay: pay.data ?? [],
        att: att.data ?? [],
        marks: marks.data ?? [],
        exams: exams.data ?? [],
        subjects: subjects.data ?? [],
        bands: bands.data ?? [],
      };
    },
  });

  const results = useMemo(() => {
    if (!q.data) return [];
    const { exams, marks, subjects, bands } = q.data;
    return exams
      .map((ex) => {
        const m = marks.filter((x) => x.exam_id === ex.id);
        if (!m.length) return null;
        const max = Number(ex.max_score);
        const avg =
          Math.round((m.reduce((a, x) => a + Number(x.score), 0) / (m.length * max)) * 1000) / 10;
        return {
          exam: ex,
          avg,
          grade: gradeFor(avg, bands)?.grade ?? "—",
          rows: m.map((x) => ({
            subject: subjects.find((s) => s.id === x.subject_id)?.name ?? "Subject",
            score: Number(x.score),
            grade: gradeFor((Number(x.score) / max) * 100, bands)?.grade ?? "—",
          })),
        };
      })
      .filter(Boolean) as {
      exam: { id: string; name: string; max_score: number };
      avg: number;
      grade: string;
      rows: { subject: string; score: number; grade: string }[];
    }[];
  }, [q.data]);

  if (q.isLoading) return <p className="mt-6 text-muted-foreground">Loading…</p>;
  if (q.error || !q.data)
    return (
      <p className="mt-6 text-destructive">Couldn't load details: {(q.error as Error)?.message}</p>
    );
  const d = q.data;
  const bal = balances(d.inv, d.pay)[child.id] ?? { billed: 0, paid: 0, balance: 0 };
  const attCount = d.att.reduce(
    (a, r) => {
      a[r.status] = (a[r.status] ?? 0) + 1;
      return a;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <p className="text-lg font-semibold">{child.full_name}</p>
        <p className="text-sm text-muted-foreground">
          Adm. {child.admission_no} · {d.school?.name}
          {d.cls ? ` · ${d.cls.name}${d.cls.stream ? " " + d.cls.stream : ""}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Fees billed" value={ksh(bal.billed)} tone="blue" />
        <Stat label="Paid" value={ksh(bal.paid)} tone="green" />
        <Stat
          label={bal.balance > 0 ? "Balance owed" : "Balance"}
          value={ksh(bal.balance)}
          tone={bal.balance > 0 ? "red" : "green"}
        />
      </div>

      <div id="parent-fees" className="scroll-mt-5">
        <Section title="Payments and receipts">
          <div className="mb-3 flex flex-wrap gap-2 print:hidden">
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() =>
                downloadCsv(
                  `fees-${child.admission_no}.csv`,
                  toCsv(d.pay, [
                    { label: "Receipt", value: (r) => r.receipt_no },
                    { label: "Date", value: (r) => r.paid_on },
                    { label: "Amount KSh", value: (r) => r.amount },
                    { label: "Method", value: (r) => r.method },
                    { label: "Reference", value: (r) => r.reference },
                  ]),
                )
              }
            >
              Download fee statement (CSV)
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() =>
                printTable("Fee statement", `${child.full_name} · ${child.admission_no}`, d.pay, [
                  { label: "Receipt", value: (r) => r.receipt_no },
                  { label: "Date", value: (r) => r.paid_on },
                  { label: "Amount (KSh)", value: (r) => r.amount },
                  { label: "Method", value: (r) => r.method },
                  { label: "Reference", value: (r) => r.reference ?? "—" },
                ])
              }
            >
              Print fee statement
            </button>
          </div>
          {d.pay.length === 0 ? (
            <Empty>No payments recorded yet.</Empty>
          ) : (
            <Table
              head={["Receipt", "Date", "Amount", "Method", "Reference"]}
              rows={d.pay.map((p) => [
                `#${p.receipt_no}`,
                p.paid_on,
                ksh(Number(p.amount)),
                p.method,
                p.reference ?? "—",
              ])}
            />
          )}
        </Section>
      </div>

      <Section title="Fee items">
        {d.inv.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 print:hidden">
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() =>
                downloadCsv(
                  `fee-items-${child.admission_no}.csv`,
                  toCsv(d.inv, [
                    { label: "Fee item", value: (r) => r.description },
                    { label: "Amount (KSh)", value: (r) => r.amount },
                    { label: "Date billed", value: (r) => r.created_at },
                  ]),
                )
              }
            >
              Download fee slip (CSV)
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() =>
                printTable(
                  "Fee items statement",
                  `${child.full_name} · ${child.admission_no}`,
                  d.inv,
                  [
                    { label: "Fee item", value: (r) => r.description },
                    { label: "Amount (KSh)", value: (r) => r.amount },
                    { label: "Date billed", value: (r) => r.created_at },
                  ],
                )
              }
            >
              Print fee slip
            </button>
          </div>
        )}
        {d.inv.length === 0 ? (
          <Empty>No fees billed yet.</Empty>
        ) : (
          <Table
            head={["Item", "Amount"]}
            rows={d.inv.map((i) => [i.description, ksh(Number(i.amount))])}
          />
        )}
      </Section>

      <div id="parent-attendance" className="scroll-mt-5">
        <Section title="Attendance (last 60 records)">
          {d.att.length === 0 ? (
            <Empty>No attendance recorded yet.</Empty>
          ) : (
            <>
              <p className="mb-3 text-sm">
                Present {attCount["present"] ?? 0} · Late {attCount["late"] ?? 0} · Absent{" "}
                {attCount["absent"] ?? 0}
              </p>
              <div className="mb-4 h-56" aria-label="Child attendance chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      {
                        status: "Attendance",
                        present: attCount["present"] ?? 0,
                        late: attCount["late"] ?? 0,
                        absent: attCount["absent"] ?? 0,
                      },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="present" fill="hsl(var(--chart-2))" />
                    <Bar dataKey="late" fill="hsl(var(--chart-4))" />
                    <Bar dataKey="absent" fill="hsl(var(--destructive))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mb-3 flex flex-wrap gap-2 print:hidden">
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={() =>
                    downloadCsv(
                      `attendance-${child.admission_no}.csv`,
                      toCsv(d.att, [
                        { label: "Date", value: (r) => r.on_date },
                        { label: "Status", value: (r) => r.status },
                      ]),
                    )
                  }
                >
                  Download attendance (CSV)
                </button>
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={() =>
                    printTable("Attendance report", `${child.full_name} · last 60 records`, d.att, [
                      { label: "Date", value: (r) => r.on_date },
                      { label: "Status", value: (r) => r.status },
                    ])
                  }
                >
                  Print attendance
                </button>
              </div>
              <Table
                head={["Date", "Status"]}
                rows={d.att.slice(0, 15).map((a) => [a.on_date, a.status])}
              />
            </>
          )}
        </Section>
      </div>

      <div id="parent-results" className="scroll-mt-5">
        <Section title="Exam results and report cards">
          {results.length === 0 ? (
            <Empty>No marks published yet.</Empty>
          ) : (
            <>
              <div className="mb-4 h-56" aria-label="Child academic performance chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={results.map((r) => ({ exam: r.exam.name, average: r.avg }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="exam" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(v) => [`${v}%`, "Average"]} />
                    <Bar
                      dataKey="average"
                      name="Average (%)"
                      fill="hsl(var(--chart-3))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mb-3 flex flex-wrap gap-2 print:hidden">
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={() =>
                    downloadCsv(
                      `performance-${child.admission_no}.csv`,
                      toCsv(
                        results.flatMap((r) =>
                          r.rows.map((x) => ({
                            exam: r.exam.name,
                            subject: x.subject,
                            score: x.score,
                            grade: x.grade,
                            average: r.avg,
                          })),
                        ),
                        [
                          { label: "Exam", value: (r) => r.exam },
                          { label: "Subject", value: (r) => r.subject },
                          { label: "Score", value: (r) => r.score },
                          { label: "Grade", value: (r) => r.grade },
                          { label: "Exam average %", value: (r) => r.average },
                        ],
                      ),
                    )
                  }
                >
                  Download performance slip (CSV)
                </button>
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={() =>
                    printTable(
                      "Academic performance report",
                      `${child.full_name} · ${child.admission_no}`,
                      results.flatMap((r) =>
                        r.rows.map((x) => ({
                          exam: r.exam.name,
                          subject: x.subject,
                          score: x.score,
                          grade: x.grade,
                          average: r.avg,
                        })),
                      ),
                      [
                        { label: "Exam", value: (r) => r.exam },
                        { label: "Subject", value: (r) => r.subject },
                        { label: "Score", value: (r) => r.score },
                        { label: "Grade", value: (r) => r.grade },
                        { label: "Exam average %", value: (r) => r.average },
                      ],
                    )
                  }
                >
                  Print performance slip
                </button>
              </div>
              {results.map((r) => (
                <div key={r.exam.id} className="mb-5">
                  <p className="mb-2 font-medium">
                    {r.exam.name} — average {r.avg}% · grade {r.grade}
                  </p>
                  <Table
                    head={["Subject", `Score /${Number(r.exam.max_score)}`, "Grade"]}
                    rows={r.rows.map((x) => [x.subject, String(x.score), x.grade])}
                  />
                </div>
              ))}
            </>
          )}
        </Section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string;
  tone?: "blue" | "green" | "red";
}) {
  const tones = {
    blue: "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40",
    green: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
    red: "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40",
  };
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="py-1 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-4 capitalize">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
