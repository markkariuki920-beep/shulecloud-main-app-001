/** School-scoped browser cache and a conservative queue for exam marks. Do not put fees,
 * permissions, credentials, or subscription changes in the offline queue. */
export type CachedEnvelope<T> = { school_id: string; saved_at: string; data: T };
export type QueuedMark = {
  school_id: string;
  exam_id: string;
  subject_id: string;
  class_id: string;
  student_id: string;
  score: number;
  entered_by: string;
  queued_at: string;
};
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const getStore = (storage?: Store): Store | undefined =>
  storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
const cacheKey = (schoolId: string, userId: string, key: string) =>
  `shulecloud:cache:v1:${schoolId}:${userId}:${key}`;
const marksKey = (schoolId: string, userId: string) =>
  `shulecloud:marks-queue:v1:${schoolId}:${userId}`;

export function readSchoolCache<T>(
  schoolId: string,
  userId: string,
  key: string,
  storage?: Store,
): T | undefined {
  try {
    const raw = getStore(storage)?.getItem(cacheKey(schoolId, userId, key));
    if (!raw) return undefined;
    const item = JSON.parse(raw) as CachedEnvelope<T>;
    if (
      item.school_id !== schoolId ||
      (!Array.isArray(item.data) && (item.data === null || typeof item.data !== "object"))
    )
      return undefined;
    return item.data;
  } catch {
    return undefined;
  }
}
export function writeSchoolCache<T>(
  schoolId: string,
  userId: string,
  key: string,
  data: T,
  storage?: Store,
): void {
  try {
    getStore(storage)?.setItem(
      cacheKey(schoolId, userId, key),
      JSON.stringify({
        school_id: schoolId,
        saved_at: new Date().toISOString(),
        data,
      } satisfies CachedEnvelope<T>),
    );
  } catch {
    /* Private mode or quota exceeded: online use still works. */
  }
}
export function readMarksQueue(schoolId: string, userId: string, storage?: Store): QueuedMark[] {
  try {
    const raw = getStore(storage)?.getItem(marksKey(schoolId, userId));
    if (!raw) return [];
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows.filter(
      (r): r is QueuedMark =>
        !!r &&
        typeof r === "object" &&
        r.school_id === schoolId &&
        typeof r.exam_id === "string" &&
        typeof r.subject_id === "string" &&
        typeof r.class_id === "string" &&
        typeof r.student_id === "string" &&
        Number.isFinite(r.score) &&
        r.score >= 0 &&
        typeof r.entered_by === "string",
    );
  } catch {
    return [];
  }
}
export function queueMarks(
  schoolId: string,
  userId: string,
  rows: Omit<QueuedMark, "queued_at">[],
  storage?: Store,
): QueuedMark[] {
  const store = getStore(storage);
  if (!store) throw new Error("This browser does not support offline storage");
  const map = new Map(
    readMarksQueue(schoolId, userId, store).map((r) => [
      `${r.exam_id}:${r.subject_id}:${r.student_id}`,
      r,
    ]),
  );
  for (const row of rows) {
    if (row.school_id !== schoolId) throw new Error("Offline queue school mismatch");
    if (row.entered_by !== userId) throw new Error("Offline queue user mismatch");
    if (!row.exam_id || !row.subject_id || !row.class_id || !row.student_id) {
      throw new Error("Offline mark is missing a required record identifier");
    }
    if (!Number.isFinite(row.score) || row.score < 0) {
      throw new Error("Offline mark score must be a non-negative number");
    }
    map.set(`${row.exam_id}:${row.subject_id}:${row.student_id}`, {
      ...row,
      queued_at: new Date().toISOString(),
    });
  }
  const result = [...map.values()];
  store.setItem(marksKey(schoolId, userId), JSON.stringify(result));
  return result;
}
export function clearSyncedMarks(
  schoolId: string,
  userId: string,
  synced: QueuedMark[],
  storage?: Store,
): QueuedMark[] {
  const store = getStore(storage);
  if (!store) return [];
  const done = new Set(synced.map((r) => `${r.exam_id}:${r.subject_id}:${r.student_id}`));
  const left = readMarksQueue(schoolId, userId, store).filter(
    (r) => !done.has(`${r.exam_id}:${r.subject_id}:${r.student_id}`),
  );
  store.setItem(marksKey(schoolId, userId), JSON.stringify(left));
  return left;
}
