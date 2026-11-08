import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type Props = { schoolId: string; role: string };
const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-xl border bg-card p-4">
    <h3 className="mb-3 font-semibold">{title}</h3>
    <div className="h-64">{children}</div>
  </section>
);
const Empty = () => (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
    No recorded data available yet.
  </div>
);

/** Role-scoped dashboard charts. Teacher queries are restricted to assigned classes before charting. */
export function RoleDashboardCharts({ schoolId, role }: Props) {
  const q = useQuery({
    queryKey: ["role-dashboard-charts", schoolId, role],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      let classIds: string[] | null = null;
      if (role === "teacher") {
        if (!auth.user) throw new Error("Sign in to view assigned-student analytics.");
        const { data, error } = await supabase
          .from("teacher_assignments")
          .select("class_id")
          .eq("school_id", schoolId)
          .eq("teacher_id", auth.user.id)
          .eq("is_active", true);
        if (error) throw error;
        classIds = [...new Set((data ?? []).map((r) => r.class_id))];
      }
      const studentQuery = supabase
        .from("students")
        .select("id, class_id")
        .eq("school_id", schoolId)
        .eq("is_active", true);
      const { data: students, error: studentError } =
        classIds === null
          ? await studentQuery
          : classIds.length
            ? await studentQuery.in("class_id", classIds)
            : { data: [], error: null };
      if (studentError) throw studentError;
      const ids = (students ?? []).map((s) => s.id);
      const [att, exams, marks, invoices, payments] = await Promise.all([
        ids.length
          ? supabase
              .from("attendance")
              .select("student_id,on_date,status")
              .eq("school_id", schoolId)
              .in("student_id", ids)
              .order("on_date")
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("exams")
          .select("id,name,max_score,created_at")
          .eq("school_id", schoolId)
          .order("created_at"),
        ids.length
          ? supabase
              .from("exam_marks")
              .select("exam_id,student_id,score")
              .eq("school_id", schoolId)
              .in("student_id", ids)
          : Promise.resolve({ data: [], error: null }),
        role === "teacher"
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from("invoices")
              .select("student_id,amount,description")
              .eq("school_id", schoolId),
        role === "teacher"
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from("payments")
              .select("amount,paid_on")
              .eq("school_id", schoolId)
              .order("paid_on"),
      ]);
      for (const r of [att, exams, marks, invoices, payments]) if (r.error) throw r.error;
      const attendanceByDate = new Map<string, { present: number; absent: number; late: number }>();
      for (const r of att.data ?? []) {
        const v = attendanceByDate.get(r.on_date) ?? { present: 0, absent: 0, late: 0 };
        if (r.status === "present" || r.status === "absent" || r.status === "late") v[r.status]++;
        attendanceByDate.set(r.on_date, v);
      }
      const attendance = [...attendanceByDate.entries()]
        .slice(-14)
        .map(([date, v]) => ({ date: date.slice(5), ...v }));
      const performance = (exams.data ?? [])
        .map((e) => {
          const rows = (marks.data ?? []).filter((m) => m.exam_id === e.id);
          const average = rows.length
            ? (rows.reduce((sum, m) => sum + Number(m.score), 0) /
                rows.length /
                (Number(e.max_score) || 100)) *
              100
            : 0;
          return { exam: e.name, average: Number(average.toFixed(1)), records: rows.length };
        })
        .filter((r) => r.records > 0);
      const monthMap = new Map<string, number>();
      for (const p of payments.data ?? []) {
        const key = String(p.paid_on ?? "").slice(0, 7);
        if (key) monthMap.set(key, (monthMap.get(key) ?? 0) + Number(p.amount));
      }
      const collection = [...monthMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, amount]) => ({ month, amount: Number(amount.toFixed(2)) }));
      const billed = (invoices.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const paid = (payments.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
      return { attendance, performance, collection, billed, paid };
    },
  });
  if (q.isLoading)
    return <p className="text-sm text-muted-foreground">Loading dashboard charts…</p>;
  if (q.isError || !q.data)
    return (
      <p role="status" className="text-sm text-destructive">
        Dashboard charts could not be loaded. Check data permissions.
      </p>
    );
  const d = q.data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {role !== "bursar" && (
        <>
          <Panel
            title={
              role === "teacher" ? "Assigned students · attendance" : "School attendance trend"
            }
          >
            {d.attendance.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.attendance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line dataKey="present" stroke="hsl(var(--chart-2))" />
                  <Line dataKey="absent" stroke="hsl(var(--destructive))" />
                  <Line dataKey="late" stroke="hsl(var(--chart-4))" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </Panel>
          <Panel
            title={
              role === "teacher"
                ? "Assigned students · exam performance"
                : "Academic performance by exam"
            }
          >
            {d.performance.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.performance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="exam" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip formatter={(v) => [`${v}%`, "Average"]} />
                  <Bar dataKey="average" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </Panel>
        </>
      )}
      {role !== "teacher" && (
        <Panel title="Fee collection · monthly (KSh)">
          {d.collection.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.collection}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey="amount"
                  name="Collected"
                  fill="hsl(var(--chart-2))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Total billed: KSh {d.billed.toLocaleString()} · Collected: KSh {d.paid.toLocaleString()}
          </p>
        </Panel>
      )}
    </div>
  );
}
