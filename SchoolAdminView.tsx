import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "./StatusBadge";
import { SchoolSetup } from "./SchoolSetup";
import { StaffManager } from "./StaffManager";
import { AcademicsPanel } from "./AcademicsPanel";
import { FinancePanel } from "./FinancePanel";
import { ParentLinksManager } from "./ParentLinksManager";
import { SchoolDriveBackupManager } from "./SchoolDriveBackupManager";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { Button } from "@/components/ui/button";
import { RoleDashboardOverview } from "./RoleDashboardOverview";
import { shuleCloudLogo } from "@/lib/branding";
import {
  BookOpen,
  CreditCard,
  LayoutDashboard,
  Settings2,
  Users,
  UserRound,
  Wallet,
  UserPlus,
  ClipboardCheck,
  FileText,
  ReceiptText,
} from "lucide-react";

type SchoolRow = {
  id: string;
  name: string;
  level: string;
  county: string | null;
  phone: string | null;
  email: string | null;
  trial_ends_at: string;
  paid_until: string | null;
  school_status: string;
};

export function SchoolAdminView({ schoolId, role }: { schoolId: string; role: string }) {
  const [activeHref, setActiveHref] = useState("#school-overview");

  // Keep the sidebar highlight in sync with the section the user navigates to.
  // The default is safe during server rendering; the URL is read after mount.
  useEffect(() => {
    const syncActiveSection = () => {
      setActiveHref(window.location.hash || "#school-overview");
    };
    syncActiveSection();
    window.addEventListener("hashchange", syncActiveSection);
    return () => window.removeEventListener("hashchange", syncActiveSection);
  }, []);

  const school = useQuery({
    queryKey: ["school", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, level, county, phone, email, trial_ends_at, paid_until, school_status")
        .eq("id", schoolId)
        .single();
      if (error) throw error;
      return data as unknown as SchoolRow;
    },
  });

  if (school.isLoading) return <p className="text-muted-foreground">Loading school…</p>;
  if (school.error || !school.data)
    return <p className="text-destructive">Couldn't load school.</p>;
  const s = school.data;
  if (s.school_status === "archived")
    return (
      <div className="rounded-xl border p-6">
        <h1 className="text-xl font-bold">School archived</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This school has been archived by the platform administrator. Access to its dashboard is
          disabled. Contact the platform administrator if this was unexpected.
        </p>
      </div>
    );
  const canEdit =
    role === "school_admin" && (s.school_status === "trial" || s.school_status === "active");

  const isAdmin = role === "school_admin";
  const isTeacher = role === "teacher";
  const isBursar = role === "bursar";
  const roleTitle = isAdmin
    ? "Admin / Principal Dashboard"
    : isTeacher
      ? "Teacher Dashboard"
      : isBursar
        ? "Bursar Dashboard"
        : "School Dashboard";
  const navItems = [
    { label: "Dashboard", href: "#school-overview", icon: LayoutDashboard },
    ...(isAdmin ? [{ label: "School setup", href: "#school-setup", icon: Settings2 }] : []),
    ...(isAdmin || isTeacher
      ? [
          {
            label: isTeacher ? "My classes & exams" : "Exams & attendance",
            href: "#school-academics",
            icon: BookOpen,
          },
        ]
      : []),
    ...(isAdmin || isBursar
      ? [{ label: "Fees & payments", href: "#school-finance", icon: Wallet }]
      : []),
    ...(isAdmin
      ? [
          { label: "Staff", href: "#school-staff", icon: Users },
          { label: "Parents", href: "#school-parents", icon: UserRound },
          { label: "Backups", href: "#school-backups", icon: ReceiptText },
          { label: "Subscription", href: "#subscription", icon: CreditCard },
        ]
      : []),
  ];

  return (
    <div className="grid min-h-[70vh] gap-5 lg:grid-cols-[228px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl bg-[#102A43] p-3 text-white shadow-lg lg:sticky lg:top-5">
        <div className="flex items-center gap-3 border-b border-white/15 px-3 pb-4 pt-2">
          <img
            src={shuleCloudLogo}
            alt=""
            className="h-9 w-9 rounded-lg bg-white object-contain p-1"
          />
          <div>
            <p className="font-display font-bold">ShuleCloud</p>
            <p className="text-xs capitalize text-slate-300">{role.replaceAll("_", " ")}</p>
          </div>
        </div>
        <nav aria-label="School dashboard" className="mt-3 flex gap-1 overflow-x-auto lg:flex-col">
          {navItems.map(({ label, href, icon: Icon }) => (
            <a
              key={href}
              href={href}
              aria-current={activeHref === href ? "location" : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${activeHref === href ? "bg-[#087EAA] text-white shadow-sm" : "text-slate-200"}`}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
            </a>
          ))}
        </nav>
        <div className="mt-5 hidden rounded-xl bg-white/10 p-3 text-xs leading-relaxed text-slate-200 lg:block">
          Your school workspace, in one place.
        </div>
      </aside>
      <div id="school-overview" className="min-w-0 space-y-5">
        <div className="rounded-t-xl bg-[#102A43] px-5 py-3 text-sm font-semibold tracking-wide text-white shadow-sm">
          {roleTitle}
        </div>
        <div className="rounded-b-2xl bg-gradient-to-r from-[#102A43] via-[#164E78] to-[#087EAA] p-5 text-white shadow-lg sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-cyan-100">ShuleCloud workspace</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{roleTitle}</h1>
              <p className="mt-2 text-sm text-slate-100">
                {s.name} · {s.level} school{s.county ? ` · ${s.county}` : ""}
              </p>
            </div>
            <StatusBadge status={s.school_status} />
          </div>
          {isAdmin && (
            <Button asChild size="sm" variant="secondary" className="mt-5">
              <a href="#subscription">Subscription &amp; billing</a>
            </Button>
          )}
        </div>

        {isAdmin ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card label="School status" value={s.school_status.replaceAll("_", " ")} tone="blue" />
            <Card
              label="Trial ends"
              value={new Date(s.trial_ends_at).toLocaleDateString()}
              tone="amber"
            />
            <Card
              label="Paid until"
              value={s.paid_until ? new Date(s.paid_until).toLocaleDateString() : "Not paid yet"}
              tone={s.paid_until ? "green" : "red"}
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card
              label="Your workspace"
              value={
                isTeacher
                  ? "Teaching & academics"
                  : isBursar
                    ? "Fees & financial records"
                    : "School services"
              }
              tone="blue"
            />
            <Card
              label="School status"
              value={s.school_status.replaceAll("_", " ")}
              tone={s.school_status === "active" ? "green" : "amber"}
            />
          </div>
        )}

        {isAdmin && !canEdit && (
          <div className="mt-1 rounded-xl border border-warning bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            Your school is read-only or suspended, so administrative changes are locked until access
            is restored.
          </div>
        )}
        <RoleDashboardOverview schoolId={s.id} role={role} />
        <section aria-label="Quick actions" className="space-y-3">
          <h2 className="text-lg font-bold">Quick actions</h2>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {(isAdmin
              ? [
                  {
                    label: "Manage students & classes",
                    detail: "Open school setup",
                    href: "#school-setup",
                    icon: UserPlus,
                    tone: "blue",
                  },
                  {
                    label: "Invite staff",
                    detail: "Teachers and bursars",
                    href: "#school-staff",
                    icon: Users,
                    tone: "green",
                  },
                  {
                    label: "Exams & marks",
                    detail: "Manage assessments",
                    href: "#school-academics",
                    icon: ClipboardCheck,
                    tone: "purple",
                  },
                  {
                    label: "Fees & payments",
                    detail: "Review school finances",
                    href: "#school-finance",
                    icon: ReceiptText,
                    tone: "amber",
                  },
                ]
              : isTeacher
                ? [
                    {
                      label: "My classes & exams",
                      detail: "Open academic tools",
                      href: "#school-academics",
                      icon: BookOpen,
                      tone: "blue",
                    },
                    {
                      label: "Record attendance",
                      detail: "Open attendance tools",
                      href: "#school-academics",
                      icon: ClipboardCheck,
                      tone: "green",
                    },
                    {
                      label: "Record marks",
                      detail: "Open exam tools",
                      href: "#school-academics",
                      icon: FileText,
                      tone: "purple",
                    },
                  ]
                : [
                    {
                      label: "Fees & payments",
                      detail: "Open financial records",
                      href: "#school-finance",
                      icon: Wallet,
                      tone: "blue",
                    },
                    {
                      label: "Record a payment",
                      detail: "Open payment tools",
                      href: "#school-finance",
                      icon: ReceiptText,
                      tone: "green",
                    },
                    {
                      label: "Fee reports",
                      detail: "Review collections",
                      href: "#school-finance",
                      icon: FileText,
                      tone: "purple",
                    },
                  ]
            ).map(({ label, detail, href, icon: Icon, tone }) => (
              <a
                key={label}
                href={href}
                className="group flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone === "blue" ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : tone === "green" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : tone === "purple" ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
        {role === "school_admin" && (
          <section id="subscription" className="mt-10 scroll-mt-6">
            <h2 className="mb-4 text-xl font-bold">Subscription &amp; billing</h2>
            <SubscriptionPanel
              schoolId={s.id}
              level={s.level}
              status={s.school_status}
              trialEndsAt={s.trial_ends_at}
              paidUntil={s.paid_until}
            />
          </section>
        )}
        {isAdmin && (
          <section
            id="school-setup"
            className="scroll-mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
          >
            <h2 className="mb-4 text-lg font-bold">School setup</h2>
            <SchoolSetup schoolId={s.id} canEdit={canEdit} />
          </section>
        )}
        {(role === "school_admin" || role === "teacher") && (
          <section
            id="school-academics"
            className="scroll-mt-5 mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
          >
            <h2 className="mb-4 text-xl font-bold">Exams, marks and attendance</h2>
            <AcademicsPanel
              schoolId={s.id}
              role={role}
              canEdit={s.school_status === "trial" || s.school_status === "active"}
            />
          </section>
        )}
        {(role === "school_admin" || role === "bursar") && (
          <section
            id="school-finance"
            className="scroll-mt-5 mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
          >
            <h2 className="mb-4 text-xl font-bold">Fees and payments</h2>
            <FinancePanel
              schoolId={s.id}
              schoolName={s.name}
              canEdit={s.school_status === "trial" || s.school_status === "active"}
            />
          </section>
        )}
        {role === "school_admin" && (
          <section
            id="school-staff"
            className="scroll-mt-5 mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
          >
            <h2 className="mb-4 text-xl font-bold">Staff</h2>
            <StaffManager schoolId={s.id} canEdit={canEdit} />
          </section>
        )}
        {role === "school_admin" && (
          <section
            id="school-parents"
            className="scroll-mt-5 mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
          >
            <h2 className="mb-4 text-xl font-bold">Parents</h2>
            <ParentLinksManager schoolId={s.id} canEdit={canEdit} />
          </section>
        )}
        {role === "school_admin" && (
          <section
            id="school-backups"
            className="scroll-mt-5 mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
          >
            <SchoolDriveBackupManager schoolId={s.id} schoolName={s.name} />
          </section>
        )}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const toneClasses = {
    blue: "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40",
    green: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
    red: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
  };
  return (
    <div className={`min-w-0 rounded-xl border p-5 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 break-words font-display text-lg font-semibold capitalize">{value}</p>
    </div>
  );
}
