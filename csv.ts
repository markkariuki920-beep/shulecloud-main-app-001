// CSV and printable exports. Cells that a spreadsheet could run as a formula are neutralised.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (FORMULA_START.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type Column<T> = { label: string; value: (row: T) => unknown };

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const head = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(","));
  return [head, ...body].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function printTable<T>(title: string, subtitle: string, rows: T[], columns: Column<T>[]) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>
    body{font-family:system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0}p{margin:4px 0 16px;color:#555;font-size:12px}
    table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f3f3f3}
  </style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)}</p><table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${columns.map((c) => `<td>${esc(c.value(r))}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></body></html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}
