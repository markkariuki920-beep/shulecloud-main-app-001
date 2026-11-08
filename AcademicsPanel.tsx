import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildReport } from "@/lib/grading";
import {
  clearSyncedAttendance,
  queueAttendance,
  readAttendanceQueue,
  type AttendanceQueueRow,
} from "@/lib/offline-attendance";
import { downloadCsv, toCsv } from "@/lib/csv";
import { AcademicAnalytics } from "./AcademicAnalytics";
import {
  clearSyncedMarks,
  queueMarks,
  readMarksQueue,
  readSchoolCache,
  writeSchoolCache,
} from "@/lib/offline-data";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function useSchoolData(schoolId: string) {
  // Third key part keeps this narrow column list separate from the full rows SchoolSetup caches under [table, schoolId].
  const useListQuery = <T,>(
    key: string,
    fn: () => PromiseLike<{ data: T | null; error: unknown }>,
  ) =>
    useQuery({
      queryKey: [key, schoolId, "academics"],
      queryFn: async () => {
        const { data: auth } = await supabase.auth.getSession();
        const cacheUserId = auth.session?.user.id;
        try {
          const { data, error } = await fn();
          if (error) throw error;
          const rows = (data ?? []) as T;
          if (cacheUserId) writeSchoolCache(schoolId, cacheUserId, key, rows);
          return rows;
        } catch (error) {
          const cached = cacheUserId ? readSchoolCache<T>(schoolId, cacheUserId, key) : undefined;
          if (cached !== undefined) return cached;
          throw error;
        }
      },
    });
  return {
    classes: useListQuery("classes", () =>
      supabase.from("classes").select("id, name, stream").eq("school_id", schoolId).order("name"),
    ),
    subjects: useListQuery("subjects", () =>
      supabase.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
    ),
    exams: useListQuery("exams", () =>
      supabase
        .from("exams")
        .select("id, name, max_score, is_locked, term_id, created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false }),
    ),
    terms: useListQuery("terms", () =>
      supabase.from("terms").select("id, name").eq("school_id", schoolId).order("starts_on"),
    ),
    bands: useListQuery("grade_bands", () =>
      supabase
        .from("grade_bands")
        .select("id, grade, min_score, points, remark")
        .eq("school_id", schoolId)
        .order("min_score", { ascending: false }),
    ),
  };
}
const classLabel = (c: { name: string; stream: string | null }) =>
  `${c.name}${c.stream ? ` ${c.stream}` : ""}`;

function useStudents(schoolId: string, classId: string) {
  return useQuery({
    queryKey: ["students", schoolId, "class", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getSession();
      const cacheUserId = auth.session?.user.id;
      try {
        const { data, error } = await supabase
          .from("students")
          .select("id, full_name, admission_no")
          .eq("school_id", schoolId)
          .eq("class_id", classId)
          .eq("is_active", true)
          .order("full_name");
        if (error) throw error;
        const rows = data ?? [];
        if (cacheUserId) writeSchoolCache(schoolId, cacheUserId, `students:${classId}`, rows);
        return rows;
      } catch (error) {
        const cached = cacheUserId
          ? readSchoolCache<{ id: string; full_name: string; admission_no: string }[]>(
              schoolId,
              cacheUserId,
              `students:${classId}`,
            )
          : undefined;
        if (cached !== undefined) return cached;
        throw error;
      }
    },
  });
}

export function AcademicsPanel({
  schoolId,
  role,
  canEdit,
}: {
  schoolId: string;
  role: string;
  canEdit: boolean;
}) {
  const isAdmin = role === "school_admin";
  return (
    <Tabs defaultValue="marks">
      <TabsList className="flex-wrap">
        <TabsTrigger value="marks">Enter marks</TabsTrigger>
        <TabsTrigger value="attendance">Attendance</TabsTrigger>
        <TabsTrigger value="analytics">Performance charts</TabsTrigger>
        {isAdmin && <TabsTrigger value="reports">Report cards</TabsTrigger>}
        {isAdmin && <TabsTrigger value="exams">Exams & grading</TabsTrigger>}
      </TabsList>
      <TabsContent value="marks" className="mt-4">
        <MarksEntry schoolId={schoolId} role={role} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="attendance" className="mt-4">
        <AttendanceEntry schoolId={schoolId} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="analytics" className="mt-4">
        <AcademicAnalytics schoolId={schoolId} role={role} />
      </TabsContent>
      {isAdmin && (
        <TabsContent value="reports" className="mt-4">
          <ReportCards schoolId={schoolId} />
        </TabsContent>
      )}
      {isAdmin && (
        <TabsContent value="exams" className="mt-4">
          <ExamsSetup schoolId={schoolId} canEdit={canEdit} />
        </TabsContent>
      )}
    </Tabs>
  );
}

function ExamsSetup({ schoolId, canEdit }: { schoolId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const d = useSchoolData(schoolId);
  const [exam, setExam] = useState({ name: "", term_id: "", max_score: "100" });
  const [band, setBand] = useState({ grade: "", min_score: "", points: "", remark: "" });
  const [editingBandId, setEditingBandId] = useState<string | null>(null);

  function startBandEdit(row: {
    id: string;
    grade: string;
    min_score: number;
    points: number | null;
    remark: string | null;
  }) {
    setBand({
      grade: row.grade,
      min_score: String(row.min_score),
      points: row.points == null ? "" : String(row.points),
      remark: row.remark ?? "",
    });
    setEditingBandId(row.id);
  }

  function cancelBandEdit() {
    setEditingBandId(null);
    setBand({ grade: "", min_score: "", points: "", remark: "" });
  }

  async function addExam(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("exams").insert({
      school_id: schoolId,
      name: exam.name.trim(),
      term_id: exam.term_id || null,
      max_score: Number(exam.max_score),
    });
    if (error) {
      toast.error(
        error.message.includes("duplicate")
          ? "An exam with that name already exists for this term."
          : error.message,
      );
      return;
    }
    toast.success("Exam created");
    setExam({ name: "", term_id: "", max_score: "100" });
    qc.invalidateQueries({ queryKey: ["exams", schoolId] });
  }
  async function toggleLock(id: string, locked: boolean) {
    const { error } = await supabase.from("exams").update({ is_locked: !locked }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["exams", schoolId] });
  }
  async function addBand(e: React.FormEvent) {
    e.preventDefault();
    const points = band.points.trim() === "" ? null : Number(band.points);
    if (points !== null && (!Number.isFinite(points) || points < 0)) {
      toast.error("Grade points must be a non-negative number, or left blank.");
      return;
    }
    const payload = {
      grade: band.grade.trim(),
      min_score: Number(band.min_score),
      points,
      remark: band.remark.trim() || null,
    };
    const result = editingBandId
      ? await supabase
          .from("grade_bands")
          .update(payload)
          .eq("id", editingBandId)
          .eq("school_id", schoolId)
      : await supabase.from("grade_bands").insert({ ...payload, school_id: schoolId });
    const { error } = result;
    if (error) {
      toast.error(
        error.message.includes("duplicate")
          ? "That grade or minimum already exists."
          : error.message,
      );
      return;
    }
    cancelBandEdit();
    toast.success(editingBandId ? "Grade band updated" : "Grade band added");
    qc.invalidateQueries({ queryKey: ["grade_bands", schoolId] });
  }
  async function removeBand(id: string) {
    const { error } = await supabase.from("grade_bands").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["grade_bands", schoolId] });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <h3 className="mb-2 font-semibold">Exams</h3>
        {canEdit && (
          <form
            onSubmit={addExam}
            className="mb-3 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2"
          >
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ex-name">Exam name *</Label>
              <Input
                id="ex-name"
                required
                value={exam.name}
                onChange={(e) => setExam({ ...exam, name: e.target.value })}
                placeholder="Mid-term 1"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ex-term">Term</Label>
              <select
                id="ex-term"
                className={selectCls}
                value={exam.term_id}
                onChange={(e) => setExam({ ...exam, term_id: e.target.value })}
              >
                <option value="">No term</option>
                {d.terms.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ex-max">Out of *</Label>
              <Input
                id="ex-max"
                type="number"
                min={1}
                required
                value={exam.max_score}
                onChange={(e) => setExam({ ...exam, max_score: e.target.value })}
              />
            </div>
            <Button type="submit" className="sm:col-span-2">
              Create exam
            </Button>
          </form>
        )}
        {(d.exams.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No exams yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {d.exams.data!.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span>
                  {x.name} · out of {Number(x.max_score)}{" "}
                  {x.is_locked && <span className="text-muted-foreground">· locked</span>}
                </span>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => toggleLock(x.id, x.is_locked)}>
                    {x.is_locked ? "Unlock" : "Lock marks"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Grading scale</h3>
        {canEdit && (
          <form
            onSubmit={addBand}
            className="mb-3 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5 xl:items-end"
          >
            <div className="space-y-1">
              <Label htmlFor="gb-grade">Grade *</Label>
              <Input
                id="gb-grade"
                required
                value={band.grade}
                onChange={(e) => setBand({ ...band, grade: e.target.value })}
                placeholder="A"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gb-min">From % *</Label>
              <Input
                id="gb-min"
                type="number"
                min={0}
                max={100}
                step="0.01"
                required
                value={band.min_score}
                onChange={(e) => setBand({ ...band, min_score: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gb-points">Grade points</Label>
              <Input
                id="gb-points"
                type="number"
                min={0}
                step="0.1"
                value={band.points}
                onChange={(e) => setBand({ ...band, points: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gb-remark">Remark</Label>
              <Input
                id="gb-remark"
                value={band.remark}
                onChange={(e) => setBand({ ...band, remark: e.target.value })}
                placeholder="Excellent"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">{editingBandId ? "Save changes" : "Add"}</Button>
              {editingBandId && (
                <Button type="button" variant="outline" onClick={cancelBandEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
        {(d.bands.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No grades yet. Add bands such as A from 80%, B from 60%.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {d.bands.data!.map((b) => (
              <li key={b.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  <strong>{b.grade}</strong> · {Number(b.min_score)}% and above
                  {b.points != null &&
                    ` · ${Number(b.points)} point${Number(b.points) === 1 ? "" : "s"}`}
                  {b.remark && ` · ${b.remark}`}
                </span>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => removeBand(b.id)}>
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

function MarksEntry({
  schoolId,
  role,
  canEdit,
}: {
  schoolId: string;
  role: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const d = useSchoolData(schoolId);
  const [sel, setSel] = useState({ exam: "", cls: "", subject: "" });
  const teacherAssignments = useQuery({
    queryKey: ["teacher-assignments", schoolId, "marks-entry"],
    enabled: role === "teacher",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_assignments")
        .select("class_id, subject_id")
        .eq("school_id", schoolId)
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const canEditSelectedSubject =
    canEdit &&
    (role !== "teacher" ||
      (teacherAssignments.data ?? []).some(
        (a) => a.class_id === sel.cls && a.subject_id === sel.subject,
      ));
  const students = useStudents(schoolId, sel.cls);
  const exam = d.exams.data?.find((x) => x.id === sel.exam);
  const marks = useQuery({
    queryKey: ["marks", sel.exam, sel.subject, sel.cls],
    enabled: !!(sel.exam && sel.subject && sel.cls && students.data),
    queryFn: async () => {
      const ids = students.data!.map((s) => s.id);
      if (!ids.length) return [];
      const key = `marks:${sel.exam}:${sel.subject}:${sel.cls}`;
      const { data: auth } = await supabase.auth.getSession();
      const cacheUserId = auth.session?.user.id;
      try {
        const { data, error } = await supabase
          .from("exam_marks")
          .select("student_id, score")
          .eq("exam_id", sel.exam)
          .eq("subject_id", sel.subject)
          .in("student_id", ids);
        if (error) throw error;
        const rows = data ?? [];
        if (cacheUserId) writeSchoolCache(schoolId, cacheUserId, key, rows);
        return rows;
      } catch (error) {
        const cached = cacheUserId
          ? readSchoolCache<{ student_id: string; score: number }[]>(schoolId, cacheUserId, key)
          : undefined;
        if (cached !== undefined) return cached;
        throw error;
      }
    },
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft(
      Object.fromEntries((marks.data ?? []).map((m) => [m.student_id, String(Number(m.score))])),
    );
  }, [marks.data]);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queuedCount, setQueuedCount] = useState(0);
  const syncingQueue = useRef(false);
  useEffect(() => {
    const refresh = async () => {
      const { data } = await supabase.auth.getSession();
      setQueuedCount(
        data.session?.user.id ? readMarksQueue(schoolId, data.session.user.id).length : 0,
      );
    };
    const onOnline = () => {
      setOnline(true);
      refresh();
    };
    const onOffline = () => setOnline(false);
    refresh();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [schoolId]);

  async function syncQueuedMarks(showToast = true) {
    if (!online || syncingQueue.current) return;
    const { data: initialAuth } = await supabase.auth.getSession();
    const currentUserId = initialAuth.session?.user.id;
    if (!currentUserId) {
      if (showToast) toast.error("Sign in again to sync queued marks");
      return;
    }
    const queued = readMarksQueue(schoolId, currentUserId);
    if (!queued.length) {
      setQueuedCount(0);
      return;
    }
    syncingQueue.current = true;
    try {
      const mine = queued.filter((r) => r.entered_by === currentUserId);
      if (mine.length !== queued.length) {
        if (showToast)
          toast.error(
            "Queued marks belong to another account. Sign in with that account to sync them.",
          );
        return;
      }
      const examIds = [...new Set(mine.map((r) => r.exam_id))];
      const { data: currentExams, error: examError } = await supabase
        .from("exams")
        .select("id, is_locked, max_score")
        .eq("school_id", schoolId)
        .in("id", examIds);
      if (examError) {
        if (showToast) toast.error("Could not verify exam locks; queued marks were kept.");
        return;
      }
      const examMap = new Map((currentExams ?? []).map((e) => [e.id, e]));
      // Re-check the student's current school/class membership at sync time. A queued mark
      // must not be replayed if a student moved classes while this device was offline.
      const studentIds = [...new Set(mine.map((r) => r.student_id))];
      const { data: currentStudents, error: studentError } = await supabase
        .from("students")
        .select("id, class_id")
        .eq("school_id", schoolId)
        .in("id", studentIds);
      if (studentError) {
        if (showToast)
          toast.error("Could not verify student class membership; queued marks were kept.");
        return;
      }
      const studentMap = new Map((currentStudents ?? []).map((s) => [s.id, s]));
      const safe = mine.filter((r) => {
        const e = examMap.get(r.exam_id);
        const student = studentMap.get(r.student_id);
        return (
          !!e &&
          !e.is_locked &&
          Number.isFinite(r.score) &&
          r.score >= 0 &&
          r.score <= Number(e.max_score) &&
          !!student &&
          student.class_id === r.class_id
        );
      });
      if (safe.length) {
        const { error } = await supabase.from("exam_marks").upsert(
          safe.map(({ queued_at: _q, class_id: _c, ...r }) => r),
          { onConflict: "exam_id,student_id,subject_id" },
        );
        if (error) {
          if (showToast) toast.error("Marks sync failed; queued marks were kept.");
          return;
        }
      }
      const remaining = clearSyncedMarks(schoolId, currentUserId, safe);
      setQueuedCount(remaining.length);
      if (showToast && safe.length)
        toast.success(`Synced ${safe.length} queued mark${safe.length === 1 ? "" : "s"}`);
      if (safe.length) qc.invalidateQueries({ queryKey: ["marks"] });
      if (showToast && safe.length !== mine.length)
        toast.error(
          "Some queued marks were kept because an exam is locked or a score is no longer valid.",
        );
    } finally {
      syncingQueue.current = false;
    }
  }
  useEffect(() => {
    if (online && queuedCount) void syncQueuedMarks(false);
  }, [online, queuedCount, schoolId]);

  async function save() {
    const { data: u } = await supabase.auth.getSession();
    if (!u.session?.user) {
      toast.error("Sign in before saving marks");
      return;
    }
    const rows = Object.entries(draft)
      .filter(([, v]) => v.trim() !== "")
      .map(([student_id, v]) => ({
        school_id: schoolId,
        exam_id: sel.exam,
        subject_id: sel.subject,
        student_id,
        score: Number(v),
        entered_by: u.session.user.id,
      }));
    if (
      rows.some(
        (r) => Number.isNaN(r.score) || r.score < 0 || (exam && r.score > Number(exam.max_score)),
      )
    ) {
      toast.error(`Scores must be between 0 and ${exam ? Number(exam.max_score) : 100}.`);
      return;
    }
    if (!rows.length) {
      toast.info("Enter at least one mark before saving");
      return;
    }
    if (!online) {
      try {
        const queued = queueMarks(
          schoolId,
          u.session.user.id,
          rows.map((r) => ({ ...r, class_id: sel.cls })),
        );
        setQueuedCount(queued.length);
        toast.success(
          `Saved ${rows.length} mark${rows.length === 1 ? "" : "s"} on this device; they will sync when internet returns`,
        );
      } catch (error) {
        toast.error((error as Error).message);
      }
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("exam_marks")
      .upsert(rows, { onConflict: "exam_id,student_id,subject_id" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Saved ${rows.length} mark${rows.length === 1 ? "" : "s"}`);
    qc.invalidateQueries({ queryKey: ["marks"] });
  }

  const locked = exam?.is_locked ?? false;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Picker
          id="mk-exam"
          label="Exam"
          value={sel.exam}
          onChange={(v) => setSel({ ...sel, exam: v })}
          options={(d.exams.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
        />
        <Picker
          id="mk-class"
          label="Class"
          value={sel.cls}
          onChange={(v) => setSel({ ...sel, cls: v })}
          options={(d.classes.data ?? []).map((c) => ({ value: c.id, label: classLabel(c) }))}
        />
        <Picker
          id="mk-subject"
          label="Subject"
          value={sel.subject}
          onChange={(v) => setSel({ ...sel, subject: v })}
          options={(d.subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>
      {(d.classes.data ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">
          No classes available to you yet. Teachers see only the classes they're assigned.
        </p>
      )}
      {role === "teacher" && sel.cls && sel.subject && !canEditSelectedSubject && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Class-teacher access: you can view marks and class performance for this class, but only
          the assigned subject teacher can enter or edit marks for this subject.
        </p>
      )}
      {sel.exam &&
        sel.cls &&
        sel.subject &&
        (students.isLoading || marks.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (students.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No students in this class.</p>
        ) : (
          <div className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 text-xs text-muted-foreground">
              <span>
                {online ? "Online" : "Offline mode — cached class data is shown where available"}
                {queuedCount > 0
                  ? ` · ${queuedCount} queued mark${queuedCount === 1 ? "" : "s"}`
                  : ""}
              </span>
              {online && queuedCount > 0 && (
                <Button size="sm" variant="outline" onClick={() => void syncQueuedMarks(true)}>
                  Sync queued marks
                </Button>
              )}
            </div>
            {locked && (
              <p className="border-b p-3 text-sm text-muted-foreground">
                This exam is locked. Marks are read-only.
              </p>
            )}
            <ul className="divide-y">
              {students.data!.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <label htmlFor={`score-${s.id}`}>
                    {s.full_name} <span className="text-muted-foreground">· {s.admission_no}</span>
                  </label>
                  <Input
                    id={`score-${s.id}`}
                    type="number"
                    min={0}
                    max={exam ? Number(exam.max_score) : 100}
                    step="0.5"
                    className="w-24"
                    disabled={!canEditSelectedSubject || locked}
                    value={draft[s.id] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [s.id]: e.target.value })}
                  />
                </li>
              ))}
            </ul>
            {canEditSelectedSubject && !locked && (
              <div className="border-t p-3 text-right">
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save marks"}
                </Button>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

function AttendanceEntry({ schoolId, canEdit }: { schoolId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const d = useSchoolData(schoolId);
  const [cls, setCls] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    setDate(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }));
  }, []);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queuedCount, setQueuedCount] = useState(0);
  const syncingQueue = useRef(false);
  useEffect(() => {
    const refreshQueue = async () => {
      const { data } = await supabase.auth.getSession();
      setQueuedCount(
        data.session?.user.id ? readAttendanceQueue(schoolId, data.session.user.id).length : 0,
      );
    };
    const onOnline = () => {
      setOnline(true);
      void refreshQueue();
    };
    const onOffline = () => setOnline(false);
    refreshQueue();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [schoolId]);
  const students = useStudents(schoolId, cls);
  const existing = useQuery({
    queryKey: ["attendance", cls, date],
    enabled: !!(cls && date),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("class_id", cls)
        .eq("on_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft(Object.fromEntries((existing.data ?? []).map((a) => [a.student_id, a.status])));
  }, [existing.data]);

  async function save() {
    // getSession reads the locally stored session and can work while offline.
    const { data: u } = await supabase.auth.getSession();
    if (!u.session?.user) {
      toast.error("Sign in before recording attendance");
      return;
    }
    const rows = (students.data ?? []).map((s) => ({
      school_id: schoolId,
      class_id: cls,
      student_id: s.id,
      on_date: date,
      status: draft[s.id] ?? "present",
      recorded_by: u.session!.user.id,
    }));
    if (!rows.length) {
      toast.info("Choose a class with students first");
      return;
    }
    if (!online) {
      try {
        const queued = queueAttendance(schoolId, u.session.user.id, rows as AttendanceQueueRow[]);
        setQueuedCount(queued.length);
        toast.success("Attendance saved on this device and queued for sync when internet returns");
      } catch (e) {
        toast.error((e as Error).message);
      }
      return;
    }
    const { error } = await supabase
      .from("attendance")
      .upsert(rows, { onConflict: "student_id,on_date" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Attendance saved");
    qc.invalidateQueries({ queryKey: ["attendance", cls, date] });
  }

  async function syncQueued(showToast = true) {
    if (!online) return void (showToast && toast.error("Connect to the internet before syncing"));
    if (syncingQueue.current) return;
    syncingQueue.current = true;
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (showToast) toast.error("Sign in again to sync attendance");
        return;
      }
      const queued = readAttendanceQueue(schoolId, u.user.id);
      if (!queued.length) {
        setQueuedCount(0);
        if (showToast) toast.info("No attendance is waiting to sync");
        return;
      }
      const mine = queued.filter((r) => r.recorded_by === u.user!.id);
      if (mine.length !== queued.length) {
        if (showToast)
          toast.error(
            "Queued attendance account mismatch. Sign in with the original account before syncing.",
          );
        return;
      }
      const payload = mine.map(({ queued_at: _queuedAt, ...r }) => r);
      const { error } = await supabase
        .from("attendance")
        .upsert(payload, { onConflict: "student_id,on_date" });
      if (error) {
        if (showToast) toast.error(`Sync failed; queued attendance was kept. ${error.message}`);
        return;
      }
      const remaining = clearSyncedAttendance(schoolId, u.user.id, mine);
      setQueuedCount(remaining.length);
      if (showToast)
        toast.success(`Synced ${mine.length} attendance record${mine.length === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["attendance"] });
    } finally {
      syncingQueue.current = false;
    }
  }

  useEffect(() => {
    if (online && queuedCount > 0) void syncQueued(false);
    // Queue synchronization is intentionally triggered only by connectivity/queue changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, queuedCount, schoolId]);

  const counts = (students.data ?? []).reduce(
    (a, s) => {
      const k = draft[s.id] ?? "present";
      a[k] = (a[k] ?? 0) + 1;
      return a;
    },
    {} as Record<string, number>,
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
        <span>
          {online ? "Online" : "Offline — changes are saved on this device"}
          {queuedCount > 0 ? ` · ${queuedCount} queued record${queuedCount === 1 ? "" : "s"}` : ""}
        </span>
        {queuedCount > 0 && (
          <Button size="sm" variant="outline" disabled={!online} onClick={() => void syncQueued()}>
            Sync queued attendance
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Picker
          id="at-class"
          label="Class"
          value={cls}
          onChange={setCls}
          options={(d.classes.data ?? []).map((c) => ({ value: c.id, label: classLabel(c) }))}
        />
        <div className="space-y-1">
          <Label htmlFor="at-date">Date</Label>
          <Input id="at-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      {cls &&
        date &&
        (students.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (students.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No students in this class.</p>
        ) : (
          <div className="rounded-xl border bg-card">
            <p className="border-b p-3 text-sm text-muted-foreground">
              Present {counts["present"] ?? 0} · Absent {counts["absent"] ?? 0} · Late{" "}
              {counts["late"] ?? 0}
              {(existing.data ?? []).length === 0 && " · not yet recorded for this day"}
            </p>
            <ul className="divide-y">
              {students.data!.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    {s.full_name} <span className="text-muted-foreground">· {s.admission_no}</span>
                  </span>
                  <select
                    aria-label={`Attendance for ${s.full_name}`}
                    disabled={!canEdit}
                    className={`${selectCls} w-32`}
                    value={draft[s.id] ?? "present"}
                    onChange={(e) => setDraft({ ...draft, [s.id]: e.target.value })}
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                  </select>
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="border-t p-3 text-right">
                <Button onClick={save}>Save attendance</Button>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

function ReportCards({ schoolId }: { schoolId: string }) {
  const d = useSchoolData(schoolId);
  const [sel, setSel] = useState({ exam: "", cls: "" });
  const students = useStudents(schoolId, sel.cls);
  const exam = d.exams.data?.find((x) => x.id === sel.exam);
  const marks = useQuery({
    queryKey: ["report-marks", sel.exam, sel.cls, students.data?.length],
    enabled: !!(sel.exam && students.data),
    queryFn: async () => {
      const ids = students.data!.map((s) => s.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("exam_marks")
        .select("student_id, subject_id, score")
        .eq("exam_id", sel.exam)
        .in("student_id", ids);
      if (error) throw error;
      return (data ?? []).map((m) => ({ ...m, score: Number(m.score) }));
    },
  });
  const subjects = useMemo(() => {
    const used = new Set((marks.data ?? []).map((m) => m.subject_id));
    return (d.subjects.data ?? []).filter((s) => used.has(s.id));
  }, [marks.data, d.subjects.data]);
  const rows = useMemo(
    () =>
      !exam || !students.data || !marks.data
        ? []
        : buildReport(
            students.data.map((s) => s.id),
            subjects.map((s) => s.id),
            marks.data,
            Number(exam.max_score),
            (d.bands.data ?? []).map((b) => ({ ...b, min_score: Number(b.min_score) })),
          ),
    [exam, students.data, marks.data, subjects, d.bands.data],
  );
  const nameOf = (id: string) => students.data?.find((s) => s.id === id);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 print:hidden">
        <Picker
          id="rc-exam"
          label="Exam"
          value={sel.exam}
          onChange={(v) => setSel({ ...sel, exam: v })}
          options={(d.exams.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
        />
        <Picker
          id="rc-class"
          label="Class"
          value={sel.cls}
          onChange={(v) => setSel({ ...sel, cls: v })}
          options={(d.classes.data ?? []).map((c) => ({ value: c.id, label: classLabel(c) }))}
        />
        {rows.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  `shulecloud-report-${sel.exam}.csv`,
                  toCsv(rows, [
                    {
                      label: "Student",
                      value: (r) => nameOf(r.studentId)?.full_name ?? r.studentId,
                    },
                    {
                      label: "Admission No.",
                      value: (r) => nameOf(r.studentId)?.admission_no ?? "",
                    },
                    { label: "Position", value: (r) => r.position ?? "" },
                    ...subjects.map((subject) => ({
                      label: subject.name,
                      value: (r: (typeof rows)[number]) => r.scores[subject.id] ?? "",
                    })),
                    { label: "Total", value: (r) => r.total },
                    { label: "Average %", value: (r) => r.average ?? "" },
                    { label: "Grade", value: (r) => r.grade ?? "" },
                    { label: "Grade points", value: (r) => r.gradePoints ?? "" },
                  ]),
                )
              }
            >
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        )}
      </div>
      {(d.bands.data ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add a grading scale under "Exams & grading" to show grades.
        </p>
      )}
      {sel.exam &&
        sel.cls &&
        (marks.isLoading || students.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students in this class.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Pos</th>
                  <th className="p-2">Student</th>
                  {subjects.map((s) => (
                    <th key={s.id} className="p-2">
                      {s.name}
                    </th>
                  ))}
                  <th className="p-2">Total</th>
                  <th className="p-2">Average</th>
                  <th className="p-2">Grade</th>
                  <th className="p-2">Points</th>
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9))
                  .map((r) => (
                    <tr key={r.studentId} className="border-b last:border-0">
                      <td className="p-2">{r.position ?? "—"}</td>
                      <td className="p-2">
                        {nameOf(r.studentId)?.full_name}{" "}
                        <span className="text-muted-foreground">
                          {nameOf(r.studentId)?.admission_no}
                        </span>
                      </td>
                      {subjects.map((s) => (
                        <td key={s.id} className="p-2">
                          {r.scores[s.id] ?? "—"}
                        </td>
                      ))}
                      <td className="p-2">{r.total}</td>
                      <td className="p-2">{r.average === null ? "—" : `${r.average}%`}</td>
                      <td className="p-2 font-semibold">{r.grade ?? "—"}</td>
                      <td className="p-2">{r.gradePoints ?? "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

function Picker({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={selectCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
