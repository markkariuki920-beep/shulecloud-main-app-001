import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "./StatusBadge";
import { daysLeft, isValidRef, ksh, normalizeRef } from "@/lib/subscription";

type Props = {
  schoolId: string;
  level: string;
  status: string;
  trialEndsAt: string;
  paidUntil: string | null;
};

export function SubscriptionPanel({ schoolId, level, status, trialEndsAt, paidUntil }: Props) {
  const qc = useQueryClient();
  const plan = useQuery({
    queryKey: ["plan", level],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("level", level as never)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const payments = useQuery({
    queryKey: ["sub-payments", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_payments")
        .select("*")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [method, setMethod] = useState<"mpesa" | "bank">("mpesa");
  const [ref, setRef] = useState("");
  const [months, setMonths] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const price = Number(plan.data?.monthly_price ?? 0);
  const grace = plan.data?.grace_days ?? 21;
  const amount = price * months;
  const refOk = isValidRef(ref);
  const trialEnd = new Date(trialEndsAt);
  const paidEnd = paidUntil ? new Date(paidUntil) : null;
  const accessEnd = paidEnd && paidEnd > trialEnd ? paidEnd : trialEnd;
  const graceEnd = new Date(accessEnd.getTime() + grace * 86_400_000);

  async function submit() {
    setBusy(true);
    const { error } = await supabase.rpc("submit_subscription_payment", {
      _school_id: schoolId,
      _months: months,
      _method: method,
      _reference: ref,
    });
    setBusy(false);
    setConfirming(false);
    if (error) return void toast.error(error.message);
    toast.success("Payment sent for verification. Your subscription updates once it is approved.");
    setRef("");
    setMonths(1);
    qc.invalidateQueries({ queryKey: ["sub-payments", schoolId] });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Plan" value={<span className="capitalize">{level}</span>} />
        <Info label="Monthly price" value={plan.isLoading ? "…" : ksh(price)} />
        <Info label="Status" value={<StatusBadge status={status} />} />
        <Info
          label={status === "trial" ? "Trial ends" : "Paid until"}
          value={
            status === "trial"
              ? `${trialEnd.toLocaleDateString()} (${daysLeft(trialEnd)} days left)`
              : paidEnd
                ? paidEnd.toLocaleDateString()
                : "Not paid yet"
          }
        />
      </div>
      {(status === "read_only" || status === "expired") && (
        <div className="rounded-xl border border-warning p-4 text-sm">
          {status === "read_only"
            ? `Your subscription ended on ${accessEnd.toLocaleDateString()}. You are in the grace period until ${graceEnd.toLocaleDateString()} (${daysLeft(graceEnd)} days left). You can view records but not change them.`
            : `Your subscription and grace period have ended. Your records are safe and still viewable; pay to make changes again.`}
        </div>
      )}

      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Record a payment</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Pay via M-Pesa or bank, then enter the reference here. We check it before your
          subscription is extended.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Paid with</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={method === "mpesa" ? "default" : "outline"}
                onClick={() => setMethod("mpesa")}
              >
                M-Pesa
              </Button>
              <Button
                type="button"
                size="sm"
                variant={method === "bank" ? "default" : "outline"}
                onClick={() => setMethod("bank")}
              >
                Bank
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="ref">{method === "mpesa" ? "M-Pesa code" : "Bank reference"}</Label>
            <Input
              id="ref"
              value={ref}
              maxLength={60}
              onChange={(e) => setRef(e.target.value)}
              placeholder="e.g. QH12AB34CD"
            />
            {ref && !refOk && (
              <p className="mt-1 text-xs text-destructive">Use 6–40 letters or numbers.</p>
            )}
          </div>
          <div>
            <Label htmlFor="months">Months</Label>
            <Input
              id="months"
              type="number"
              min={1}
              max={12}
              value={months}
              onChange={(e) =>
                setMonths(Math.min(12, Math.max(1, Math.floor(Number(e.target.value) || 1))))
              }
            />
          </div>
        </div>
        <p className="mt-4 text-sm">
          Amount: <strong>{ksh(amount)}</strong> ({months} × {ksh(price)})
        </p>
        {!confirming ? (
          <Button className="mt-3" disabled={!refOk || !price} onClick={() => setConfirming(true)}>
            Continue
          </Button>
        ) : (
          <div className="mt-3 rounded-lg border p-3 text-sm">
            <p>
              Submit <strong>{normalizeRef(ref)}</strong> for <strong>{ksh(amount)}</strong> (
              {months} month{months > 1 ? "s" : ""})?
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={busy} onClick={submit}>
                {busy ? "Sending…" : "Yes, submit"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
                Back
              </Button>
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold">Payment history</h3>
        <div className="mt-2 overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="p-2">Submitted</th>
                <th className="p-2">Reference</th>
                <th className="p-2">Months</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Status</th>
                <th className="p-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(payments.data ?? []).map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="p-2 font-mono">{p.reference}</td>
                  <td className="p-2">{p.months}</td>
                  <td className="p-2">{ksh(Number(p.amount))}</td>
                  <td className="p-2">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {p.status === "pending" && "Waiting for verification"}
                    {p.status === "rejected" &&
                      `Rejected: ${p.review_note ?? ""}. Correct and resubmit.`}
                    {p.status === "confirmed" &&
                      p.period_end &&
                      `Covers until ${new Date(p.period_end).toLocaleDateString()}`}
                  </td>
                </tr>
              ))}
              {payments.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-3 text-muted-foreground">
                    No payments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 font-semibold">{value}</div>
    </div>
  );
}
