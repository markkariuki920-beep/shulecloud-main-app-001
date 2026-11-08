import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarCheck,
  CircleDollarSign,
  ClipboardList,
  GraduationCap,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { balances, ksh } from "@/lib/finance";
import { RoleDashboardCharts } from "./RoleDashboardCharts";

type Props = { schoolId: string; role: string };

/** Role-specific, data-backed dashboard cards. Values come from this school only. */
export function RoleDashboardOverview({ schoolId, role }: Props) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const qc = useQueryClient();
  // Refresh the summary cards whenever any other school list is refreshed after a save.
  useEffect(
    () =>
      qc.getQueryCache().subscribe((e) => {
        if (
          e.type === "updated" &&
          e.action.type === "invalidate" &&
          e.query.queryKey[0] !== "role-dashboard-overview"
        )
          void qc.invalidateQueries({ queryKey: ["role-dashboard-overview", schoolId] });
      }),
    [qc, schoolId],
  );
  const query = useQuery({
    queryKey: ["role-dashboard-overview", schoolId, role, today],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const [students, classes, staff, attendance, exams, marks, invoices, payments, assignments] =
        await Promise.all([
          supabase
            .from("students")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId)
            .eq("is_active", true),
          supabase
            .from("classes")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId),
          supabase
            .from("user_roles")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId)
            .in("role", ["teacher", "bursar"]),
          supabase
            .from("attendance")
            .select("status")
            .eq("school_id", schoolId)
            .eq("on_date", today),
          supabase
            .from("exams")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId),
          supabase
            .from("exam_marks")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId),
          role === "teacher"
            ? Promise.resolve({ data: [] as { student_id: string; amount: number }[], error: null })
            : supabase.from("invoices").select("student_id, amount").eq("school_id", schoolId),
          role === "teacher"
            ? Promise.resolve({
                data: [] as { student_id: string; amount: number; paid_on: string }[],
                error: null,
              })
            : supabase
                .from("payments")
                .select("student_id, amount, paid_on")
                .eq("school_id", schoolId),
          role === "teacher" && auth.user
            ? supabase
                .from("teacher_assignments")
                .select("class_id")
                .eq("school_id", schoolId)
                .eq("teacher_id", auth.user.id)
                .eq("is_active", true)
            : Promise.resolve({ data: [] as { class_id: string }[], error: null }),
        ]);
      for (const result of [
        students,
        classes,
        staff,
        attendance,
        exams,
        marks,
        invoices,
        payments,
        assignments,
      ]) {
        if (result.error) throw result.error;
      }
      const inv = invoices.data ?? [];
      const pay = payments.data ?? [];
      const totals = Object.values(balances(inv, pay)).reduce(
        (acc, row) => ({
          billed: acc.billed + row.billed,
          paid: acc.paid + row.paid,
          outstanding: acc.outstanding + Math.max(0, row.balance),
        }),
        { billed: 0, paid: 0, outstanding: 0 },
      );
      return {
        students: students.count ?? 0,
        classes:
          role === "teacher"
            ? new Set((assignments.data ?? []).map((row) => row.class_id)).size
            : (classes.count ?? 0),
        staff: staff.count ?? 0,
        attendance: attendance.data?.length ?? 0,
        attendanceRate: students.count
          ? Math.round(
              ((attendance.data ?? []).filter((row) => row.status === "present").length /
                students.count) *
                100,
            )
          : 0,
        exams: exams.count ?? 0,
        marks: marks.count ?? 0,
        totals,
        paymentsToday: pay
          .filter((row) => row.paid_on === today)
          .reduce((sum, row) => sum + Number(row.amount), 0),
      };
    },
  });

  const d = query.data;
  const cards =
    role === "bursar"
      ? [
          {
            label: "Total billed",
            value: d ? ksh(d.totals.billed) : "—",
            icon: ClipboardList,
            tone: "green",
          },
          {
            label: "Collected",
            value: d ? ksh(d.totals.paid) : "—",
            icon: CircleDollarSign,
            tone: "blue",
          },
          {
            label: "Outstanding",
            value: d ? ksh(d.totals.outstanding) : "—",
            icon: Wallet,
            tone: "red",
          },
          {
            label: "Collected today",
            value: d ? ksh(d.paymentsToday) : "—",
            icon: CalendarCheck,
            tone: "purple",
          },
        ]
      : role === "teacher"
        ? [
            {
              label: "Active students",
              value: d?.students ?? "—",
              icon: GraduationCap,
              tone: "blue",
            },
            { label: "Classes", value: d?.classes ?? "—", icon: BookOpen, tone: "green" },
            { label: "Examinations", value: d?.exams ?? "—", icon: ClipboardList, tone: "purple" },
            { label: "Marks recorded", value: d?.marks ?? "—", icon: CalendarCheck, tone: "amber" },
          ]
        : [
            {
              label: "Active students",
              value: d?.students ?? "—",
              icon: GraduationCap,
              tone: "blue",
            },
            { label: "Staff accounts", value: d?.staff ?? "—", icon: Users, tone: "green" },
            {
              label: "Pending fees",
              value: d ? ksh(d.totals.outstanding) : "—",
              icon: Wallet,
              tone: "amber",
            },
            {
              label: "Attendance today",
              value: d ? `${d.attendanceRate}%` : "—",
              icon: CalendarCheck,
              tone: "red",
            },
          ];
  const tone: Record<string, string> = {
    blue: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
    green:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    red: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
    purple:
      "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
    amber:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  };

  return (
    <section aria-label="Dashboard summary" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone: cardTone }) => (
          <article
            key={label}
            className={`min-w-0 rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md ${tone[cardTone]}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold leading-5 opacity-80">{label}</p>
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0 opacity-80" />
            </div>
            <p className="mt-3 break-words font-display text-xl font-bold tabular-nums sm:text-2xl">
              {query.isLoading ? "…" : value}
            </p>
          </article>
        ))}
      </div>
      <RoleDashboardCharts schoolId={schoolId} role={role} />
      {query.error && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        >
          Some summary figures could not be loaded. Check school data permissions; the detailed
          sections remain available below.
        </p>
      )}
      {role === "bursar" && (
        <p className="text-xs text-muted-foreground">
          Financial totals are calculated from this school’s recorded invoices and payments.
          “Collected today” uses payments recorded for today.
        </p>
      )}
      {role === "teacher" && (
        <p className="text-xs text-muted-foreground">
          Your class count reflects active teaching assignments. Examination and marks totals are
          limited to your assigned classes and students.
        </p>
      )}
    </section>
  );
}
