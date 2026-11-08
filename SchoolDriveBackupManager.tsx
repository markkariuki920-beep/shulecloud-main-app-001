import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getSchoolDriveBackup,
  connectSchoolGoogleDrive,
  saveSchoolDriveBackupSettings,
  runSchoolDriveBackupNow,
} from "@/lib/integrations.functions";

type DriveStatus = {
  enabled: boolean;
  frequency: "daily" | "every_3_days" | "weekly" | "manual";
  google_email: string | null;
  connected_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_status: "success" | "failed" | null;
  last_error: string | null;
  last_file_id: string | null;
  last_file_name: string | null;
  last_file_url: string | null;
};
const frequencyLabels = {
  daily: "Daily",
  every_3_days: "Every 3 days",
  weekly: "Weekly (Sunday default)",
  manual: "Manual only",
};
export function SchoolDriveBackupManager({
  schoolId,
  schoolName,
}: {
  schoolId: string;
  schoolName: string;
}) {
  const qc = useQueryClient();
  const [frequency, setFrequency] = useState<DriveStatus["frequency"]>("weekly");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ["school-drive-backup", schoolId],
    queryFn: async () => (await getSchoolDriveBackup({ data: { schoolId } })) as DriveStatus,
  });
  useEffect(() => {
    if (status.data) {
      setFrequency(status.data.frequency);
      setEnabled(status.data.enabled);
    }
  }, [status.data]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("driveBackup") === "connected") {
      toast.success("Google Drive connected. Save your backup schedule below.");
      params.delete("driveBackup");
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`,
      );
      void qc.invalidateQueries({ queryKey: ["school-drive-backup", schoolId] });
    } else if (params.get("driveBackup") === "error") {
      toast.error("Google Drive connection failed. Check OAuth configuration and try again.");
      params.delete("driveBackup");
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`,
      );
    }
  }, [qc, schoolId]);
  async function connect() {
    setBusy(true);
    try {
      const result = await connectSchoolGoogleDrive({ data: { schoolId } });
      window.location.assign(result.url);
    } catch (error) {
      toast.error((error as Error).message || "Could not start Google Drive connection");
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      await saveSchoolDriveBackupSettings({ data: { schoolId, frequency, enabled } });
      await qc.invalidateQueries({ queryKey: ["school-drive-backup", schoolId] });
      toast.success("Google Drive backup settings saved");
    } catch (error) {
      toast.error((error as Error).message || "Could not save backup settings");
    } finally {
      setBusy(false);
    }
  }
  async function backupNow() {
    setBusy(true);
    try {
      const result = await runSchoolDriveBackupNow({ data: { schoolId } });
      toast.success(
        `Google Drive backup complete: ${result.rows} rows across ${result.tables} data groups.`,
      );
      await qc.invalidateQueries({ queryKey: ["school-drive-backup", schoolId] });
    } catch (error) {
      toast.error((error as Error).message || "Google Drive backup failed");
      await qc.invalidateQueries({ queryKey: ["school-drive-backup", schoolId] });
    } finally {
      setBusy(false);
    }
  }
  const s = status.data;
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">School backups to Google Drive</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep a separate copy of {schoolName}'s school records in a folder named ShuleCloud-Backup-
          {schoolName}. Backups contain school records, not provider credentials.
        </p>
      </div>
      {status.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading backup settings…</p>
      ) : status.error ? (
        <p className="text-sm text-destructive">
          Could not load Google Drive settings. Apply migration 0009 and check your signed-in school
          admin account.
        </p>
      ) : (
        <>
          <div className="rounded-xl border p-4">
            <p className="text-sm">
              Google account: <strong>{s?.google_email ?? "Not connected"}</strong>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {s?.connected_at
                ? `Connected ${new Date(s.connected_at).toLocaleString()}`
                : "Connect the Google account where this school should store its backups."}
            </p>
            <Button className="mt-3" variant="outline" onClick={connect} disabled={busy}>
              {s?.google_email ? "Reconnect Google Drive" : "Connect Google Drive"}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Automatic backup frequency</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as DriveStatus["frequency"])}
              >
                {Object.entries(frequencyLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>
                <strong>Enable automatic backups</strong>
                <span className="block text-xs text-muted-foreground">
                  Requires Google Drive to be connected and the scheduled job configured.
                </span>
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={busy}>
              Save schedule
            </Button>
            <Button variant="outline" onClick={backupNow} disabled={busy || !s?.google_email}>
              Back up now
            </Button>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p>
              Last successful backup:{" "}
              {s?.last_success_at ? new Date(s.last_success_at).toLocaleString() : "None yet"}
            </p>
            <p className="mt-1">Latest status: {s?.last_status ?? "Not run"}</p>
            {s?.last_file_name && (
              <p className="mt-1 break-all">
                Latest verified file: <strong>{s.last_file_name}</strong>
              </p>
            )}
            {s?.last_file_url?.startsWith("https://drive.google.com/") && (
              <a
                className="mt-2 inline-flex min-h-9 items-center rounded-md border px-3 font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                href={s.last_file_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open latest backup in Google Drive
              </a>
            )}
            {s?.last_error && <p className="mt-1 text-destructive">{s.last_error}</p>}
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        First-time setup requires a Google Cloud OAuth client, the redirect URI
        /api/public/google-drive/callback, and private server secrets GOOGLE_DRIVE_CLIENT_ID,
        GOOGLE_DRIVE_CLIENT_SECRET, APP_URL and INTEGRATIONS_ENCRYPTION_KEY.
      </p>
    </section>
  );
}
