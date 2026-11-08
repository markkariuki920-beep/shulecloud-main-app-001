import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./StatusBadge";
import { ksh } from "@/lib/subscription";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type School = {
  id: string;
  name: string;
  level: string;
  trial_ends_at: string;
  paid_until: string | null;
  school_status: string;
};

export function SubscriptionAdmin({ schools }: { schools: School[] }) {
  const qc = useQueryClient();
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("monthly_price");
      if (error) throw error;
      return data;
    },
  });
  const settings = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("*").single();
      if (error) throw error;
      return data;
    },
  });
  const payments = useQuery({
    queryKey: ["all-sub-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const revenue = useQuery({
    queryKey: ["revenue", from, to],
    queryFn: async () => {
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      const { data, error } = await supabase.rpc("subscription_revenue", {
        _from: new Date(from).toISOString(),
        _to: end.toISOString(),
      });
      if (error) throw error;
      return data?.[0] ?? { total: 0, payments: 0 };
    },
  });

  const name = (id: string) => schools.find((s) => s.id === id)?.name ?? "Unknown school";
  const refresh = () => qc.invalidateQueries();

  async function savePlan(level: string, price: string, grace: string) {
    const { error } = await supabase.rpc("set_plan_price", {
      _level: level as never,
      _price: Number(price),
      _grace_days: Number(grace),
    });
    if (error) return void toast.error(error.message);
    toast.success("Plan updated");
    refresh();
  }
  async function saveTrial(days: string) {
    const { error } = await supabase.rpc("set_trial_days", { _days: Number(days) });
    if (error) return void toast.error(error.message);
    toast.success("Default trial length updated");
    refresh();
  }
  async function review(id: string, confirm: boolean) {
    const note = confirm ? null : window.prompt("Reason for rejecting (shown to the school)?");
    if (!confirm && !note?.trim()) return;
    if (confirm && !window.confirm("Confirm this payment and extend the subscription?")) return;
    const { error } = await supabase.rpc("review_subscription_payment", {
      _payment_id: id,
      _confirm: confirm,
      ...(note ? { _note: note } : {}),
    });
    if (error) return void toast.error(error.message);
    toast.success(confirm ? "Payment confirmed" : "Payment rejected");
    refresh();
  }

  const pending = (payments.data ?? []).filter((p) => p.status === "pending");
  const trials = schools.filter((s) => s.school_status === "trial");
  const overdue = schools.filter(
    (s) => s.school_status === "read_only" || s.school_status === "expired",
  );
  const active = schools.filter((s) => s.school_status === "active");
  const chartColors = [
    "hsl(var(--primary))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--destructive))",
  ];
  const statusData = [
    { name: "Paid / active", value: active.length },
    { name: "Free trial", value: trials.length },
    { name: "Unpaid / expired", value: overdue.length },
    { name: "Suspended", value: schools.filter((s) => s.school_status === "suspended").length },
  ].filter((item) => item.value > 0);
  // The chart uses confirmed payment records returned by the existing payments query (latest 200).
  // It is deliberately labelled as recent records rather than claiming a complete all-time ledger.
  const confirmedPayments = (payments.data ?? []).filter((p) => p.status === "confirmed");
  const revenueByMonth = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      month: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      revenue: confirmedPayments
        .filter((p) => String(p.created_at).slice(0, 7) === key)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0),
    };
  });

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="font-semibold">School and subscription analytics</h3>
          <p className="text-sm text-muted-foreground">
            Live counts from registered school records.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Registered schools", schools.length],
            ["Paid / active", active.length],
            ["Free trials", trials.length],
            ["Unpaid / expired", overdue.length],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <h4 className="font-medium">Subscription status breakdown</h4>
            {statusData.length ? (
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      outerRadius={78}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      <Cell fill={chartColors[0]} />
                      <Cell fill={chartColors[1]} />
                      <Cell fill={chartColors[2]} />
                      <Cell fill={chartColors[3]} />
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-sm text-muted-foreground">
                School status data will appear here when schools register.
              </p>
            )}
          </div>
          <div className="rounded-xl border bg-card p-5">
            <h4 className="font-medium">Revenue received from all schools</h4>
            <p className="mb-2 text-xs text-muted-foreground">
              Monthly confirmed ShuleCloud subscription revenue from the latest 200 payment records
              loaded by this dashboard. This is platform subscription income, not school fee income.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `KSh ${Number(v).toLocaleString()}`}
                    width={82}
                  />
                  <Tooltip formatter={(v) => [ksh(Number(v)), "Confirmed revenue"]} />
                  <Bar
                    dataKey="revenue"
                    name="Confirmed revenue"
                    fill="hsl(var(--primary))"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">Plans</h3>
          <div className="mt-3 space-y-3">
            {(plans.data ?? []).map((p) => (
              <PlanRow key={p.level} plan={p} onSave={savePlan} />
            ))}
          </div>
          {settings.data && <TrialRow days={settings.data.trial_days} onSave={saveTrial} />}
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">Confirmed revenue</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-auto"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-auto"
            />
          </div>
          <p className="mt-4 font-display text-3xl font-bold">
            {revenue.isLoading ? "…" : ksh(Number(revenue.data?.total ?? 0))}
          </p>
          <p className="text-sm text-muted-foreground">
            {revenue.data?.payments ?? 0} confirmed payments. Pending and rejected are not counted.
          </p>
        </div>
      </div>

      <section>
        <h3 className="font-semibold">Pending payments ({pending.length})</h3>
        <div className="mt-2 space-y-2">
          {pending.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm"
            >
              <div>
                <p className="font-semibold">{name(p.school_id)}</p>
                <p className="text-muted-foreground">
                  {p.method === "mpesa" ? "M-Pesa" : "Bank"}{" "}
                  <span className="font-mono">{p.reference}</span> · {p.months} mo ·{" "}
                  {ksh(Number(p.amount))} · {new Date(p.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => review(p.id, true)}>
                  Confirm
                </Button>
                <Button size="sm" variant="outline" onClick={() => review(p.id, false)}>
                  Reject
                </Button>
              </div>
            </div>
          ))}
          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SchoolList
          title="On trial"
          rows={trials}
          date={(s) => `Trial ends ${new Date(s.trial_ends_at).toLocaleDateString()}`}
        />
        <SchoolList
          title="Overdue / expired"
          rows={overdue}
          date={(s) =>
            s.paid_until
              ? `Paid until ${new Date(s.paid_until).toLocaleDateString()}`
              : `Trial ended ${new Date(s.trial_ends_at).toLocaleDateString()}`
          }
        />
      </div>

      <section>
        <h3 className="font-semibold">Payment history</h3>
        <div className="mt-2 overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="p-2">School</th>
                <th className="p-2">Reference</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Status</th>
                <th className="p-2">Reviewed</th>
                <th className="p-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {(payments.data ?? [])
                .filter((p) => p.status !== "pending")
                .map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{name(p.school_id)}</td>
                    <td className="p-2 font-mono">{p.reference}</td>
                    <td className="p-2">{ksh(Number(p.amount))}</td>
                    <td className="p-2">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="p-2">
                      {p.reviewed_at ? new Date(p.reviewed_at).toLocaleString() : ""}
                    </td>
                    <td className="p-2 text-muted-foreground">{p.review_note}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PlanRow({
  plan,
  onSave,
}: {
  plan: { level: string; monthly_price: number; grace_days: number };
  onSave: (l: string, p: string, g: string) => void;
}) {
  const [price, setPrice] = useState(String(plan.monthly_price));
  const [grace, setGrace] = useState(String(plan.grace_days));
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <span className="w-24 font-medium capitalize">{plan.level}</span>
      <label className="text-xs text-muted-foreground">
        KSh/month
        <Input
          type="number"
          min={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-28"
        />
      </label>
      <label className="text-xs text-muted-foreground">
        Grace days
        <Input
          type="number"
          min={0}
          max={365}
          value={grace}
          onChange={(e) => setGrace(e.target.value)}
          className="w-24"
        />
      </label>
      <Button size="sm" variant="outline" onClick={() => onSave(plan.level, price, grace)}>
        Save
      </Button>
    </div>
  );
}

function TrialRow({ days, onSave }: { days: number; onSave: (d: string) => void }) {
  const [d, setD] = useState(String(days));
  return (
    <div className="mt-4 flex items-end gap-2 border-t pt-4 text-sm">
      <span className="w-24 font-medium">New trials</span>
      <label className="text-xs text-muted-foreground">
        Days
        <Input
          type="number"
          min={1}
          max={90}
          value={d}
          onChange={(e) => setD(e.target.value)}
          className="w-24"
        />
      </label>
      <Button size="sm" variant="outline" onClick={() => onSave(d)}>
        Save
      </Button>
    </div>
  );
}

function SchoolList({
  title,
  rows,
  date,
}: {
  title: string;
  rows: School[];
  date: (s: School) => string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="font-semibold">
        {title} ({rows.length})
      </h3>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((s) => (
          <li key={s.id} className="flex justify-between gap-2">
            <span>{s.name}</span>
            <span className="text-muted-foreground">{date(s)}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-muted-foreground">None</li>}
      </ul>
    </div>
  );
}
