export type Money = { student_id: string; amount: number | string };

/** Balance per student = billed − paid. Positive means the student owes. */
export function balances(invoices: Money[], payments: Money[]) {
  const out: Record<string, { billed: number; paid: number; balance: number }> = {};
  const get = (id: string) => (out[id] ??= { billed: 0, paid: 0, balance: 0 });
  for (const i of invoices) {
    const amount = Number(i.amount);
    if (!i.student_id || !Number.isFinite(amount) || amount < 0) {
      throw new Error("Invoice amount must be a finite non-negative number with a student ID");
    }
    get(i.student_id).billed += amount;
  }
  for (const p of payments) {
    const amount = Number(p.amount);
    if (!p.student_id || !Number.isFinite(amount) || amount < 0) {
      throw new Error("Payment amount must be a finite non-negative number with a student ID");
    }
    get(p.student_id).paid += amount;
  }
  for (const v of Object.values(out)) v.balance = v.billed - v.paid;
  return out;
}

export const ksh = (n: number) => `KSh ${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
