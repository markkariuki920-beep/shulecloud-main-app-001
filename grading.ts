export type GradeBand = {
  grade: string;
  min_score: number;
  points?: number | null;
  remark?: string | null;
};
export type Mark = { student_id: string; subject_id: string; score: number };

/** Highest band whose minimum the percentage reaches. */
export function gradeFor(percent: number, bands: GradeBand[]): GradeBand | null {
  const sorted = [...bands].sort((a, b) => Number(b.min_score) - Number(a.min_score));
  return sorted.find((b) => percent >= Number(b.min_score)) ?? null;
}

export type ReportRow = {
  studentId: string;
  scores: Record<string, number | null>;
  total: number;
  subjectsSat: number;
  average: number | null; // percent across subjects sat
  grade: string | null;
  gradePoints: number | null;
  position: number | null;
};

/** Builds report rows; students with equal averages share a position (1, 2, 2, 4). */
export function buildReport(
  studentIds: string[],
  subjectIds: string[],
  marks: Mark[],
  maxScore: number,
  bands: GradeBand[],
): ReportRow[] {
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    throw new Error("Maximum exam score must be a positive finite number");
  }
  for (const mark of marks) {
    if (!Number.isFinite(mark.score) || mark.score < 0 || mark.score > maxScore) {
      throw new Error("Exam mark must be a finite number between zero and the maximum score");
    }
  }

  const rows: ReportRow[] = studentIds.map((sid) => {
    const scores: Record<string, number | null> = {};
    let total = 0,
      sat = 0;
    for (const sub of subjectIds) {
      const m = marks.find((x) => x.student_id === sid && x.subject_id === sub);
      scores[sub] = m ? Number(m.score) : null;
      if (m) {
        total += Number(m.score);
        sat++;
      }
    }
    const average = sat ? Math.round((total / (sat * maxScore)) * 1000) / 10 : null;
    const band = average === null ? null : gradeFor(average, bands);
    return {
      studentId: sid,
      scores,
      total,
      subjectsSat: sat,
      average,
      grade: band?.grade ?? null,
      gradePoints: band?.points == null ? null : Number(band.points),
      position: null,
    };
  });
  const ranked = rows.filter((r) => r.average !== null).sort((a, b) => b.average! - a.average!);
  ranked.forEach((r, i) => {
    r.position = i > 0 && ranked[i - 1]!.average === r.average ? ranked[i - 1]!.position : i + 1;
  });
  return rows;
}
