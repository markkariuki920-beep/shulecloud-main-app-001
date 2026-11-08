// Mirrors the database rules so the screen can preview them. The server
// recalculates and enforces everything; these are display helpers only.

export const normalizeRef = (ref: string) => ref.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const isValidRef = (ref: string) => {
  const n = normalizeRef(ref);
  return n.length >= 6 && n.length <= 40;
};

export const subscriptionAmount = (monthlyPrice: number, months: number) => {
  if (!Number.isInteger(months) || months < 1 || months > 12)
    throw new Error("Months must be between 1 and 12");
  return monthlyPrice * months;
};

/** New paid period starts at the latest of now, current paid-until and trial end. */
export function renewalStart(now: Date, paidUntil: Date | null, trialEndsAt: Date) {
  return new Date(Math.max(now.getTime(), paidUntil?.getTime() ?? 0, trialEndsAt.getTime()));
}

export function daysLeft(until: Date, now = new Date()) {
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 86_400_000));
}

export const ksh = (n: number) => `KSh ${Number(n).toLocaleString("en-KE")}`;

export const statusLabel: Record<string, string> = {
  trial: "Free trial",
  active: "Active",
  read_only: "Grace period (view only)",
  expired: "Expired (view only)",
  suspended: "Suspended",
  archived: "Archived",
};
