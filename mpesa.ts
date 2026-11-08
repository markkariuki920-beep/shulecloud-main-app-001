// Shared M-Pesa helpers (no secrets here). Used by the server and by tests.

/** Converts 07XX, 01XX, +2547XX, 2547XX into 2547XXXXXXXX / 2541XXXXXXXX. Returns null if invalid. */
export function normalizeKePhone(input: string): string | null {
  const d = (input ?? "").replace(/[^\d]/g, "");
  let n = d;
  if (/^0[17]\d{8}$/.test(d)) n = "254" + d.slice(1);
  else if (/^[17]\d{8}$/.test(d)) n = "254" + d;
  return /^254[17]\d{8}$/.test(n) ? n : null;
}

export type MpesaStatus = "pending" | "success" | "failed" | "cancelled" | "timeout";

/** Maps a Daraja STK ResultCode to our status. */
export function stkResultStatus(code: string | number | null | undefined): MpesaStatus {
  const c = String(code ?? "");
  if (c === "0") return "success";
  if (c === "1032") return "cancelled";
  if (c === "1037" || c === "1019") return "timeout";
  if (c === "") return "pending";
  return "failed";
}

/** Daraja timestamp YYYYMMDDHHmmss in Nairobi time. */
export function darajaTimestamp(d = new Date()) {
  const t = new Date(d.getTime() + 3 * 3600_000); // Nairobi is UTC+3 all year
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
}

export const darajaBaseUrl = (env: "sandbox" | "production") =>
  env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

/** Shows only the last 4 characters of a saved credential. */
export function maskSecret(value: string) {
  const v = value ?? "";
  if (v.length <= 4) return "••••";
  return "••••" + v.slice(-4);
}

/** Pulls Amount, MpesaReceiptNumber and PhoneNumber out of an STK callback. */
export function readStkCallback(body: unknown) {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback;
  if (!cb || typeof cb["CheckoutRequestID"] !== "string") return null;
  const items =
    (cb["CallbackMetadata"] as { Item?: { Name: string; Value?: unknown }[] })?.Item ?? [];
  const get = (n: string) => items.find((i) => i.Name === n)?.Value;
  return {
    checkoutRequestId: cb["CheckoutRequestID"] as string,
    resultCode: String(cb["ResultCode"] ?? ""),
    resultDesc: String(cb["ResultDesc"] ?? ""),
    amount: get("Amount") != null ? Number(get("Amount")) : null,
    receipt: get("MpesaReceiptNumber") != null ? String(get("MpesaReceiptNumber")) : null,
  };
}
