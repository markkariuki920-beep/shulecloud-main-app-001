import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { SubscriptionAdmin } from "./SubscriptionAdmin";
import { BackupManager } from "./BackupManager";
import { IntegrationManager } from "./IntegrationManager";
import { ksh } from "@/lib/finance";
import { shuleCloudLogo } from "@/lib/branding";

type School = {
  id: string;
  name: string;
  level: string;
  county: string | null;
  trial_ends_at: string;
  paid_until: string | null;
  school_status: string;
  manually_suspended: boolean;
};

export function SuperAdminView() {
  const qc = useQueryClient();
  const apps = useQuery({
    queryKey: ["all-apps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const schools = useQuery({
    queryKey: ["all-schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select(
          "id, name, level, county, trial_ends_at, paid_until, manually_suspended, school_status",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as School[];
    },
  });
  const logs = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const revenue = useQuery({
    queryKey: ["platform-revenue", monthStart.toISOString().slice(0, 7)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("subscription_revenue", {
        _from: monthStart.toISOString(),
        _to: new Date().toISOString(),
      });
      if (error) throw error;
      return data?.[0] ?? { total: 0, payments: 0 };
    },
  });

  const refresh = () => qc.invalidateQueries();

  async function review(id: string, approve: boolean) {
    const note = approve ? null : window.prompt("Reason for rejection?");
    if (!approve && !note) return;
    const { error } = await supabase.rpc("review_school_application", {
      _app_id: id,
      _approve: approve,
      ...(note ? { _note: note } : {}),
    });
    if (error) return void toast.error(error.message);
    toast.success(approve ? "School approved — trial started" : "Application rejected");
    refresh();
  }
  async function extend(id: string) {
    const enteredDays = window.prompt("Extend trial by how many days? (1-60)");
    if (enteredDays === null || enteredDays.trim() === "") return;
    const days = Number(enteredDays);
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      toast.error("Enter a whole number from 1 to 60 days.");
      return;
    }
    const reason = window.prompt("Reason for extension?");
    if (!reason || reason.trim().length < 5) {
      toast.error("Please provide a reason of at least 5 characters.");
      return;
    }
    const { error } = await supabase.rpc("extend_trial", {
      _school_id: id,
      _days: days,
      _reason: reason,
    });
    if (error) return void toast.error(error.message);
    toast.success("Trial extended");
    refresh();
  }
  async function archive(id: string, shouldArchive: boolean, name: string) {
    const confirmation = shouldArchive
      ? window.confirm(
          `Archive ${name}? This hides it from active school management and locks edits. Historical records are preserved; this is not permanent deletion.`,
        )
      : window.confirm(
          `Restore ${name} from the archive? Its previous subscription/suspension status will still apply.`,
        );
    if (!confirmation) return;
    const reason = window.prompt(
      shouldArchive
        ? "Reason for archiving this school (minimum 5 characters):"
        : "Reason for restoring this school (minimum 5 characters):",
    );
    if (!reason || reason.trim().length < 5) return;
    const { error } = await supabase.rpc(
      "archive_school" as never,
      { _school_id: id, _archive: shouldArchive, _reason: reason.trim() } as never,
    );
    if (error) return void toast.error(error.message);
    toast.success(shouldArchive ? "School archived; records preserved" : "School restored");
    refresh();
  }

  async function suspend(id: string, s: boolean) {
    const reason = window.prompt(s ? "Reason for suspension?" : "Reason for reactivation?");
    if (!reason) return;
    const { error } = await supabase.rpc("set_school_suspension", {
      _school_id: id,
      _suspend: s,
      _reason: reason,
    });
    if (error) return void toast.error(error.message);
    toast.success(s ? "School suspended" : "School reactivated");
    refresh();
  }

  const a = apps.data ?? [];
  const sc = schools.data ?? [];
  const count = (st: string) => sc.filter((x) => x.school_status === st).length;
  const visibleSchools = sc.filter((x) => x.school_status !== "archived");
  const archivedSchools = sc.filter((x) => x.school_status === "archived");
  const stats = [
    { label: "Schools", value: visibleSchools.length, tone: "blue" },
    {
      label: "Revenue this month",
      value: revenue.data
        ? ksh(Number(revenue.data.total))
        : revenue.isLoading
          ? "…"
          : "Unavailable",
      tone: "green",
    },
    { label: "Pending", value: a.filter((x) => x.status === "pending").length, tone: "amber" },
    { label: "On trial", value: count("trial"), tone: "cyan" },
    { label: "Active", value: count("active"), tone: "green" },
    { label: "Unpaid / expired", value: count("read_only") + count("expired"), tone: "red" },
    { label: "Suspended", value: count("suspended"), tone: "red" },
    { label: "Archived", value: archivedSchools.length, tone: "neutral" },
  ] as const;
  const statTone: Record<(typeof stats)[number]["tone"], string> = {
    blue: "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40",
    cyan: "border-cyan-200 bg-cyan-50 dark:border-cyan-900 dark:bg-cyan-950/40",
    green: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
    red: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
    neutral: "border-border bg-card",
  };

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[228px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl bg-[#102A43] p-3 text-white shadow-lg lg:sticky lg:top-5">
        <div className="flex items-center gap-3 border-b border-white/15 px-3 pb-4 pt-2">
          <img
            src={shuleCloudLogo}
            alt=""
            className="h-9 w-9 rounded-lg bg-white object-contain p-1"
          />
          <div>
            <p className="font-display font-bold">ShuleCloud</p>
            <p className="text-xs text-slate-300">Super Admin</p>
          </div>
        </div>
        <nav
          aria-label="Super Admin dashboard"
          className="mt-3 flex gap-1 overflow-x-auto lg:flex-col"
        >
          {[
            ["Overview", "#platform-overview"],
            ["Applications", "#platform-applications"],
            ["Schools", "#platform-schools"],
            ["Subscriptions", "#subscriptions"],
            ["Integrations", "#platform-integrations"],
            ["Backups", "#platform-backups"],
            ["Audit log", "#platform-audit"],
          ].map(([label, href], index) => (
            <a
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/10 ${index === 0 ? "bg-[#087EAA] text-white" : "text-slate-200"}`}
            >
              <span className="text-xs opacity-70">0{index + 1}</span>
              {label}
            </a>
          ))}
        </nav>
        <div className="mt-5 hidden rounded-xl bg-white/10 p-3 text-xs leading-relaxed text-slate-200 lg:block">
          Global control across every registered school.
        </div>
      </aside>
      <div className="min-w-0 space-y-10">
        <div id="platform-overview">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">Platform overview</h1>
            <Button asChild size="sm" variant="outline">
              <a href="#subscriptions">Subscription management</a>
            </Button>
          </div>
          <p className="text-muted-foreground">Super Admin</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {stats.map(({ label, value, tone }) => (
              <div
                key={label}
                className={`min-w-0 rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md ${statTone[tone]}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="mt-2 font-display text-2xl font-bold tabular-nums" aria-live="polite">
                  {schools.isLoading ? "…" : value}
                </p>
              </div>
            ))}
          </div>
          {(schools.error || apps.error || logs.error || revenue.error) && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
            >
              Some platform information could not be loaded. Check your connection and permissions,
              then refresh the page.
              {schools.error && <p className="mt-1">Schools: {(schools.error as Error).message}</p>}
              {apps.error && <p className="mt-1">Applications: {(apps.error as Error).message}</p>}
              {logs.error && <p className="mt-1">Audit log: {(logs.error as Error).message}</p>}
              {revenue.error && <p className="mt-1">Revenue: {(revenue.error as Error).message}</p>}
            </div>
          )}
        </div>

        <section
          id="platform-applications"
          className="scroll-mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
        >
          <h2 className="text-lg font-semibold">Applications</h2>
          {a.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">No applications yet.</p>
          )}
          <div className="mt-3 space-y-3">
            {a.map((x) => (
              <div
                key={x.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
              >
                <div>
                  <p className="font-semibold">
                    {x.school_name} <StatusBadge status={x.status} />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="capitalize">{x.level}</span> · {x.county} · {x.phone} ·{" "}
                    {x.email} · ~{x.student_estimate ?? 0} students
                  </p>
                </div>
                {x.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => review(x.id, true)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => review(x.id, false)}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section
          id="platform-schools"
          className="scroll-mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
        >
          <h2 className="text-lg font-semibold">Schools</h2>
          {sc.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">No approved schools yet.</p>
          )}
          <div className="mt-3 space-y-3">
            {visibleSchools.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
              >
                <div>
                  <p className="font-semibold">
                    {s.name} <StatusBadge status={s.school_status} />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Trial ends {new Date(s.trial_ends_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => extend(s.id)}>
                    Extend trial
                  </Button>
                  {s.manually_suspended ? (
                    <Button size="sm" onClick={() => suspend(s.id, false)}>
                      Reactivate
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => suspend(s.id, true)}>
                      Suspend
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => archive(s.id, true, s.name)}>
                    Archive
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {archivedSchools.length > 0 && (
            <div className="mt-6 rounded-xl border p-4">
              <h3 className="font-semibold">Archived schools ({archivedSchools.length})</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Archived schools are hidden from the active list. Their records are retained.
              </p>
              <div className="mt-3 space-y-2">
                {archivedSchools.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {s.name} <StatusBadge status="archived" />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Archived school · data retained
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => archive(s.id, false, s.name)}
                    >
                      Restore school
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section id="subscriptions" className="scroll-mt-6">
          <h2 className="mb-4 text-lg font-semibold">Subscription management</h2>
          <SubscriptionAdmin schools={visibleSchools} />
        </section>

        <div id="platform-integrations" className="scroll-mt-5">
          <IntegrationManager />
        </div>

        <div id="platform-backups" className="scroll-mt-5">
          <BackupManager />
        </div>

        <section
          id="platform-audit"
          className="scroll-mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
        >
          <h2 className="text-lg font-semibold">Recent audit log</h2>
          <ul className="mt-3 divide-y rounded-lg border bg-card text-sm">
            {(logs.data ?? []).map((l) => (
              <li key={l.id} className="flex justify-between px-4 py-2">
                <span>{l.action}</span>
                <span className="text-muted-foreground">
                  {new Date(l.created_at).toLocaleString()}
                </span>
              </li>
            ))}
            {logs.data?.length === 0 && (
              <li className="px-4 py-2 text-muted-foreground">No entries.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
