import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { balances, ksh } from "@/lib/finance";
import { downloadCsv, toCsv } from "@/lib/csv";

const sel = "h-9 rounded-md border bg-background px-2 text-sm";

export function FinancePanel({
  schoolId,
  canEdit,
  schoolName,
}: {
  schoolId: string;
  canEdit: boolean;
  schoolName: string;
}) {
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ["finance", schoolId],
    queryFn: async () => {
      const [c, t, s, f, i, p] = await Promise.all([
        supabase.from("classes").select("id, name, stream").eq("school_id", schoolId).order("name"),
        supabase.from("terms").select("id, name").eq("school_id", schoolId).order("starts_on"),
        supabase
          .from("students")
          .select("id, full_name, admission_no, class_id")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .order("full_name"),
        supabase.from("fee_items").select("*").eq("school_id", schoolId).order("created_at"),
        supabase.from("invoices").select("*").eq("school_id", schoolId),
        supabase
          .from("payments")
          .select("*")
          .eq("school_id", schoolId)
          .order("receipt_no", { ascending: false }),
      ]);
      for (const r of [c, t, s, f, i, p]) if (r.error) throw r.error;
      return {
        classes: c.data!,
        terms: t.data!,
        students: s.data!,
        fees: f.data!,
        invoices: i.data!,
        payments: p.data!,
      };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["finance", schoolId] });

  const [fee, setFee] = useState({ name: "", amount: "", class_id: "", term_id: "" });
  const [pay, setPay] = useState({ student_id: "", amount: "", method: "cash", reference: "" });
  const [classFilter, setClassFilter] = useState("");
  const [receipt, setReceipt] = useState<Tables<"payments"> | null>(null);

  if (data.isLoading) return <p className="text-muted-foreground">Loading fees…</p>;
  if (data.error || !data.data) return <p className="text-destructive">Couldn't load fees.</p>;
  const d = data.data;
  const className = (id: string | null) => {
    const c = d.classes.find((x) => x.id === id);
    return c ? `${c.name}${c.stream ? " " + c.stream : ""}` : "All classes";
  };
  const studentName = (id: string) => d.students.find((s) => s.id === id)?.full_name ?? "—";
  const bal = balances(d.invoices, d.payments);

  async function addFee(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(fee.amount);
    if (!fee.name.trim() || !(amount > 0)) return void toast.error("Enter a fee name and amount");
    const { error } = await supabase.from("fee_items").insert({
      school_id: schoolId,
      name: fee.name.trim(),
      amount,
      class_id: fee.class_id || null,
      term_id: fee.term_id || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setFee({ name: "", amount: "", class_id: "", term_id: "" });
    toast.success("Fee added");
    refresh();
  }

  async function billFee(f: (typeof d.fees)[number]) {
    const targets = d.students.filter((s) => !f.class_id || s.class_id === f.class_id);
    const already = new Set(
      d.invoices.filter((i) => i.fee_item_id === f.id).map((i) => i.student_id),
    );
    const rows = targets
      .filter((s) => !already.has(s.id))
      .map((s) => ({
        school_id: schoolId,
        student_id: s.id,
        fee_item_id: f.id,
        description: f.name,
        amount: f.amount,
      }));
    if (!rows.length) return void toast.info("Everyone is already billed for this fee");
    const { error } = await supabase.from("invoices").insert(rows);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Billed ${rows.length} students`);
    refresh();
  }

  async function deleteFee(id: string) {
    const { error } = await supabase.from("fee_items").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(pay.amount);
    if (!pay.student_id || !(amount > 0))
      return void toast.error("Pick a student and enter an amount");
    const { data: row, error } = await supabase
      .from("payments")
      .insert({
        school_id: schoolId,
        student_id: pay.student_id,
        amount,
        method: pay.method,
        reference: pay.reference.trim() || null,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Receipt #${row.receipt_no} recorded`);
    setReceipt(row);
    setPay({ student_id: "", amount: "", method: "cash", reference: "" });
    refresh();
  }

  const shown = d.students.filter((s) => !classFilter || s.class_id === classFilter);
  const totals = Object.values(bal).reduce(
    (a, v) => ({ billed: a.billed + v.billed, paid: a.paid + v.paid }),
    { billed: 0, paid: 0 },
  );

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Total billed" value={ksh(totals.billed)} />
        <Stat label="Collected" value={ksh(totals.paid)} />
        <Stat label="Outstanding" value={ksh(totals.billed - totals.paid)} />
      </div>
      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="fees">Fee structure</TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter balances by class"
              className={sel}
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="">All classes</option>
              {d.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {className(c.id)}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "shulecloud-fee-balances.csv",
                  toCsv(
                    shown.map((s) => ({
                      student: s.full_name,
                      admission: s.admission_no,
                      class: className(s.class_id),
                      billed: bal[s.id]?.billed ?? 0,
                      paid: bal[s.id]?.paid ?? 0,
                      balance: bal[s.id]?.balance ?? 0,
                    })),
                    [
                      { label: "Student", value: (r) => r.student },
                      { label: "Admission No.", value: (r) => r.admission },
                      { label: "Class", value: (r) => r.class },
                      { label: "Billed (KSh)", value: (r) => r.billed },
                      { label: "Paid (KSh)", value: (r) => r.paid },
                      { label: "Balance (KSh)", value: (r) => r.balance },
                    ],
                  ),
                )
              }
            >
              Export balances CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print
            </Button>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Student</th>
                <th>Class</th>
                <th className="text-right">Billed</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const b = bal[s.id] ?? { billed: 0, paid: 0, balance: 0 };
                return (
                  <tr key={s.id} className="border-b">
                    <td className="py-2">
                      {s.full_name}{" "}
                      <span className="text-muted-foreground">({s.admission_no})</span>
                    </td>
                    <td>{className(s.class_id)}</td>
                    <td className="text-right">{ksh(b.billed)}</td>
                    <td className="text-right">{ksh(b.paid)}</td>
                    <td
                      className={`text-right font-semibold ${b.balance > 0 ? "text-destructive" : ""}`}
                    >
                      {ksh(b.balance)}
                    </td>
                  </tr>
                );
              })}
              {!shown.length && (
                <tr>
                  <td colSpan={5} className="py-4 text-muted-foreground">
                    No students yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="payments" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "shulecloud-payments.csv",
                  toCsv(
                    d.payments.map((p) => ({
                      receipt: p.receipt_no,
                      date: p.paid_on,
                      student: studentName(p.student_id),
                      method: p.method,
                      reference: p.reference ?? "",
                      amount: Number(p.amount),
                    })),
                    [
                      { label: "Receipt", value: (r) => r.receipt },
                      { label: "Date", value: (r) => r.date },
                      { label: "Student", value: (r) => r.student },
                      { label: "Method", value: (r) => r.method },
                      { label: "Reference", value: (r) => r.reference },
                      { label: "Amount (KSh)", value: (r) => r.amount },
                    ],
                  ),
                )
              }
            >
              Export payments CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print payments
            </Button>
          </div>
          {canEdit && (
            <form
              onSubmit={recordPayment}
              className="flex flex-wrap gap-2 rounded-xl border bg-card p-4"
            >
              <select
                className={sel}
                value={pay.student_id}
                onChange={(e) => setPay({ ...pay, student_id: e.target.value })}
              >
                <option value="">Student…</option>
                {d.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.admission_no})
                  </option>
                ))}
              </select>
              <Input
                className="w-32"
                type="number"
                min="1"
                placeholder="Amount"
                value={pay.amount}
                onChange={(e) => setPay({ ...pay, amount: e.target.value })}
              />
              <select
                className={sel}
                value={pay.method}
                onChange={(e) => setPay({ ...pay, method: e.target.value })}
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="bank">Bank</option>
                <option value="cheque">Cheque</option>
              </select>
              <Input
                className="w-44"
                placeholder="Reference (optional)"
                value={pay.reference}
                onChange={(e) => setPay({ ...pay, reference: e.target.value })}
              />
              <Button type="submit">Record payment</Button>
            </form>
          )}
          {receipt && (
            <Receipt
              row={receipt}
              school={schoolName}
              student={studentName(receipt.student_id)}
              balance={bal[receipt.student_id]?.balance ?? 0}
              onClose={() => setReceipt(null)}
            />
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Receipt</th>
                <th>Date</th>
                <th>Student</th>
                <th>Method</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.payments.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="py-2">#{p.receipt_no}</td>
                  <td>{p.paid_on}</td>
                  <td>{studentName(p.student_id)}</td>
                  <td className="capitalize">
                    {p.method}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </td>
                  <td className="text-right">{ksh(Number(p.amount))}</td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setReceipt(p)}>
                      Receipt
                    </Button>
                  </td>
                </tr>
              ))}
              {!d.payments.length && (
                <tr>
                  <td colSpan={6} className="py-4 text-muted-foreground">
                    No payments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="fees" className="mt-4 space-y-4">
          {canEdit && (
            <form onSubmit={addFee} className="flex flex-wrap gap-2 rounded-xl border bg-card p-4">
              <Input
                className="w-44"
                placeholder="Fee name e.g. Tuition"
                value={fee.name}
                onChange={(e) => setFee({ ...fee, name: e.target.value })}
              />
              <Input
                className="w-32"
                type="number"
                min="1"
                placeholder="Amount"
                value={fee.amount}
                onChange={(e) => setFee({ ...fee, amount: e.target.value })}
              />
              <select
                className={sel}
                value={fee.class_id}
                onChange={(e) => setFee({ ...fee, class_id: e.target.value })}
              >
                <option value="">All classes</option>
                {d.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {className(c.id)}
                  </option>
                ))}
              </select>
              <select
                className={sel}
                value={fee.term_id}
                onChange={(e) => setFee({ ...fee, term_id: e.target.value })}
              >
                <option value="">Any term</option>
                {d.terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button type="submit">Add fee</Button>
            </form>
          )}
          <ul className="divide-y rounded-xl border">
            {d.fees.map((f) => {
              const billed = d.invoices.filter((i) => i.fee_item_id === f.id).length;
              return (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <span>
                    <b>{f.name}</b> · {ksh(Number(f.amount))} · {className(f.class_id)}
                    {f.term_id ? ` · ${d.terms.find((t) => t.id === f.term_id)?.name}` : ""} ·{" "}
                    <span className="text-muted-foreground">{billed} billed</span>
                  </span>
                  {canEdit && (
                    <span className="flex gap-2">
                      <Button size="sm" onClick={() => billFee(f)}>
                        Bill students
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => deleteFee(f.id)}>
                        Delete
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
            {!d.fees.length && (
              <li className="p-3 text-sm text-muted-foreground">No fees set up yet.</li>
            )}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Receipt({
  row,
  school,
  student,
  balance,
  onClose,
}: {
  row: Tables<"payments">;
  school: string;
  student: string;
  balance: number;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 print:border-0">
      <h3 className="font-display text-lg font-bold">
        {school} — Official receipt #{row.receipt_no}
      </h3>
      <p className="mt-2 text-sm">
        Received from <b>{student}</b> the sum of <b>{ksh(Number(row.amount))}</b> by{" "}
        <span className="capitalize">{row.method}</span>
        {row.reference ? ` (ref ${row.reference})` : ""} on {row.paid_on}.
      </p>
      <p className="mt-1 text-sm">
        Balance remaining: <b>{ksh(balance)}</b>
      </p>
      <div className="mt-3 flex gap-2 print:hidden">
        <Button size="sm" onClick={() => window.print()}>
          Print
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
