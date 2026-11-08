/** Small, school-scoped offline queue for attendance only. Never queue financial or permission changes. */
export type AttendanceQueueRow = {
  school_id: string;
  class_id: string;
  student_id: string;
  on_date: string;
  status: "present" | "absent" | "late";
  recorded_by: string;
};
export type QueuedAttendance = AttendanceQueueRow & { queued_at: string };

const keyFor = (schoolId: string, userId: string) =>
  `shulecloud:attendance-queue:v1:${schoolId}:${userId}`;

export function readAttendanceQueue(
  schoolId: string,
  userId: string,
  storage?: Pick<Storage, "getItem">,
): QueuedAttendance[] {
  try {
    const raw = (
      storage ?? (typeof localStorage === "undefined" ? undefined : localStorage)
    )?.getItem(keyFor(schoolId, userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is QueuedAttendance =>
        !!r &&
        typeof r === "object" &&
        (r as QueuedAttendance).school_id === schoolId &&
        typeof (r as QueuedAttendance).student_id === "string" &&
        typeof (r as QueuedAttendance).class_id === "string" &&
        typeof (r as QueuedAttendance).on_date === "string" &&
        ["present", "absent", "late"].includes((r as QueuedAttendance).status),
    );
  } catch {
    return [];
  }
}

export function queueAttendance(
  schoolId: string,
  userId: string,
  rows: AttendanceQueueRow[],
  storage?: Pick<Storage, "getItem" | "setItem">,
): QueuedAttendance[] {
  const store = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!store) throw new Error("This browser does not support local offline storage");
  const current = readAttendanceQueue(schoolId, userId, store);
  const merged = new Map(current.map((r) => [`${r.student_id}:${r.on_date}`, r]));
  for (const row of rows) {
    if (row.school_id !== schoolId) throw new Error("Attendance queue school mismatch");
    if (row.recorded_by !== userId) throw new Error("Attendance queue user mismatch");
    merged.set(`${row.student_id}:${row.on_date}`, { ...row, queued_at: new Date().toISOString() });
  }
  const result = [...merged.values()];
  store.setItem(keyFor(schoolId, userId), JSON.stringify(result));
  return result;
}

export function clearSyncedAttendance(
  schoolId: string,
  userId: string,
  synced: QueuedAttendance[],
  storage?: Pick<Storage, "getItem" | "setItem">,
): QueuedAttendance[] {
  const store = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!store) return [];
  const done = new Set(synced.map((r) => `${r.student_id}:${r.on_date}`));
  const remaining = readAttendanceQueue(schoolId, userId, store).filter(
    (r) => !done.has(`${r.student_id}:${r.on_date}`),
  );
  store.setItem(keyFor(schoolId, userId), JSON.stringify(remaining));
  return remaining;
}
