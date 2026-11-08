import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv, toCsv, printTable } from "@/lib/csv";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const palette = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];
const pct = (n: number) => `${n.toFixed(1)}%`;

type Mark = { exam_id: string; student_id: string; subject_id: string; score: number | string };

export function AcademicAnalytics({
  schoolId,
  role = "school_admin",
}: {
  schoolId: string;
  role?: string;
}) {
  const [examId, setExamId] = useState("all");
  const [classId, setClassId] = useState("all");
  const q = useQuery({
    queryKey: ["academic-analytics", schoolId, role],
    queryFn: async () => {
      let assignedClassIds: string[] | null = null;
      if (role === "teacher") {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("Sign in to view your assigned students' performance.");
        const { data: assignments, error: assignmentError } = await supabase
          .from("teacher_assignments")
          .select("class_id")
          .eq("school_id", schoolId)
          .eq("teacher_id", auth.user.id)
          .eq("is_active", true);
        if (assignmentError) throw assignmentError;
        assignedClassIds = [...new Set((assignments ?? []).map((a) => a.class_id))];
      }
      const [exams, classes, subjects, students, bands] = await Promise.all([
        supabase
          .from("exams")
          .select("id, name, max_score, created_at, term_id")
          .eq("school_id", schoolId)
          .order("created_at"),
        supabase.from("classes").select("id, name, stream").eq("school_id", schoolId).order("name"),
        supabase.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
        (() => {
          const q = supabase
            .from("students")
            .select("id, class_id, is_active")
            .eq("school_id", schoolId);
          return assignedClassIds === null
            ? q
            : assignedClassIds.length
              ? q.in("class_id", assignedClassIds)
              : q.in("id", ["00000000-0000-0000-0000-000000000000"]);
        })(),
        supabase
          .from("grade_bands")
          .select("grade, min_score, remark")
          .eq("school_id", schoolId)
          .order("min_score", { ascending: false }),
      ]);
      for (const result of [exams, classes, subjects, students, bands])
        if (result.error) throw result.error;
      const studentIds = (students.data ?? []).map((student) => student.id);
      const { data: marks, error: marksError } = studentIds.length
        ? await supabase
            .from("exam_marks")
            .select("exam_id, student_id, subject_id, score")
            .eq("school_id", schoolId)
            .in("student_id", studentIds)
        : { data: [], error: null };
      if (marksError) throw marksError;
      const visibleClassIds = assignedClassIds === null ? null : new Set(assignedClassIds);
      return {
        exams: exams.data ?? [],
        classes: (classes.data ?? []).filter(
          (c) => visibleClassIds === null || visibleClassIds.has(c.id),
        ),
        subjects: subjects.data ?? [],
        students: students.data ?? [],
        marks: (marks ?? []) as Mark[],
        bands: bands.data ?? [],
      };
    },
  });

  const data = q.data;
  const analytics = useMemo(() => {
    if (!data) return null;
    const chosenExams = examId === "all" ? data.exams : data.exams.filter((e) => e.id === examId);
    const chosenIds = new Set(chosenExams.map((e) => e.id));
    const studentMap = new Map(data.students.map((s) => [s.id, s]));
    const classMap = new Map(
      data.classes.map((c) => [c.id, `${c.name}${c.stream ? ` ${c.stream}` : ""}`]),
    );
    const subjectMap = new Map(data.subjects.map((s) => [s.id, s.name]));
    const marks = data.marks.filter(
      (m) =>
        chosenIds.has(m.exam_id) &&
        (classId === "all" || studentMap.get(m.student_id)?.class_id === classId),
    );
    const maxByExam = new Map(data.exams.map((e) => [e.id, Number(e.max_score) || 100]));
    const rows = marks.map((m) => ({
      ...m,
      percent: Math.max(
        0,
        Math.min(100, (Number(m.score) / (maxByExam.get(m.exam_id) || 100)) * 100),
      ),
      className: classMap.get(studentMap.get(m.student_id)?.class_id ?? "") ?? "Unassigned",
      subjectName: subjectMap.get(m.subject_id) ?? "Unknown subject",
    }));
    const average = (list: { percent: number }[]) =>
      list.length ? list.reduce((sum, r) => sum + r.percent, 0) / list.length : 0;
    const classPerformance = data.classes
      .filter((c) => classId === "all" || c.id === classId)
      .map((c) => {
        const label = `${c.name}${c.stream ? ` ${c.stream}` : ""}`;
        const list = rows.filter((r) => r.className === label);
        return { name: label, average: Number(average(list).toFixed(1)), marks: list.length };
      })
      .filter((x) => x.marks > 0);
    const subjectPerformance = data.subjects
      .map((s) => {
        const list = rows.filter((r) => r.subject_id === s.id);
        return { name: s.name, average: Number(average(list).toFixed(1)), marks: list.length };
      })
      .filter((x) => x.marks > 0);
    const gradeDistribution = data.bands
      .map((b, i) => {
        const floor = Number(b.min_score);
        const upper = i === 0 ? 101 : Number(data.bands[i - 1]?.min_score ?? 101);
        const count = rows.filter((r) => r.percent >= floor && r.percent < upper).length;
        return { name: b.grade, value: count };
      })
      .filter((x) => x.value > 0);
    const trendRows = data.marks
      .filter((m) => classId === "all" || studentMap.get(m.student_id)?.class_id === classId)
      .map((m) => ({
        ...m,
        percent: Math.max(
          0,
          Math.min(100, (Number(m.score) / (maxByExam.get(m.exam_id) || 100)) * 100),
        ),
      }));
    const examTrend = data.exams
      .map((e) => {
        const list = trendRows.filter((r) => r.exam_id === e.id);
        return {
          name: e.name,
          average: Number(average(list).toFixed(1)),
          marks: list.length,
          date: e.created_at,
        };
      })
      .filter((row) => row.marks > 0)
      .sort((a, b) =>
        String(data.exams.find((e) => e.name === a.name)?.created_at ?? "").localeCompare(
          String(data.exams.find((e) => e.name === b.name)?.created_at ?? ""),
        ),
      );
    const failBands = data.bands.filter((b) => /fail/i.test(`${b.grade} ${b.remark ?? ""}`));
    const passBands = data.bands.filter((b) => !/fail/i.test(`${b.grade} ${b.remark ?? ""}`));
    const passFloor =
      failBands.length && passBands.length
        ? Math.min(...passBands.map((b) => Number(b.min_score)))
        : null;
    const passed = passFloor === null ? 0 : rows.filter((r) => r.percent >= passFloor).length;
    return {
      rows,
      classPerformance,
      subjectPerformance,
      gradeDistribution,
      examTrend,
      average: average(rows),
      passRate: rows.length && passFloor !== null ? (passed / rows.length) * 100 : null,
      marksCount: rows.length,
      studentsCount: new Set(rows.map((r) => r.student_id)).size,
    };
  }, [data, examId, classId]);

  if (q.isLoading)
    return <p className="py-8 text-sm text-muted-foreground">Loading academic analytics…</p>;
  if (q.isError)
    return (
      <p className="py-8 text-sm text-destructive">
        Could not load academic analytics. Check your school permissions and try again.
      </p>
    );
  if (!data || data.exams.length === 0 || data.marks.length === 0)
    return (
      <div className="rounded-xl border p-6">
        <h3 className="font-semibold">Academic performance</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Charts will appear here once exams and marks have been recorded. No sample results are
          shown.
        </p>
      </div>
    );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Academic performance</h2>
        <p className="text-sm text-muted-foreground">
          Charts are calculated from recorded marks and this school’s grading bands. Missing marks
          are not treated as zero.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Examination
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
          >
            <option value="all">All examinations</option>
            {data.exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Class
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="all">All classes</option>
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.stream ? ` ${c.stream}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {analytics && analytics.rows.length > 0 && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() =>
              downloadCsv(
                "shulecloud-performance-summary.csv",
                toCsv(analytics.rows, [
                  { label: "Student ID", value: (r) => r.student_id },
                  { label: "Class", value: (r) => r.className },
                  { label: "Subject", value: (r) => r.subjectName },
                  { label: "Score (%)", value: (r) => r.percent.toFixed(1) },
                ]),
              )
            }
          >
            Download performance data (CSV)
          </button>
          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() =>
              printTable(
                "Academic performance summary",
                role === "teacher" ? "Assigned students only" : "School academic performance",
                analytics.rows,
                [
                  { label: "Student ID", value: (r) => r.student_id },
                  { label: "Class", value: (r) => r.className },
                  { label: "Subject", value: (r) => r.subjectName },
                  { label: "Score (%)", value: (r) => r.percent.toFixed(1) },
                ],
              )
            }
          >
            Print performance summary
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ["Mean score", analytics ? pct(analytics.average) : "—"],
          [
            "Pass rate",
            analytics?.passRate !== null && analytics?.passRate !== undefined
              ? pct(analytics.passRate)
              : "Configure pass/fail grade bands",
          ],
          ["Students assessed", analytics?.studentsCount ?? 0],
          ["Recorded marks", analytics?.marksCount ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Average score by class" empty={!analytics?.classPerformance.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics?.classPerformance ?? []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v) => [`${v}%`, "Average"]} />
              <Bar dataKey="average" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Average score by subject" empty={!analytics?.subjectPerformance.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics?.subjectPerformance ?? []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v) => [`${v}%`, "Average"]} />
              <Bar dataKey="average" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Grade distribution" empty={!analytics?.gradeDistribution.length}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={analytics?.gradeDistribution ?? []}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label
              >
                {(analytics?.gradeDistribution ?? []).map((entry, i) => (
                  <Cell key={entry.name} fill={palette[i % palette.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Average score across examinations" empty={!analytics?.examTrend.length}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics?.examTrend ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v) => [`${v}%`, "Average"]} />
              <Line
                type="monotone"
                dataKey="average"
                stroke="hsl(var(--chart-3))"
                strokeWidth={2}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      {(!data.bands.length || analytics?.passRate === null) && (
        <p className="text-xs text-muted-foreground">
          To calculate pass rate accurately, configure grading bands and mark the failing grade with
          “Fail” in its grade name or remark. Until then, no pass rate is guessed.
        </p>
      )}
    </div>
  );
}

function ChartCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="font-medium">{title}</h3>
      <div className="mt-3 h-64">
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No marks available for this selection.
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
