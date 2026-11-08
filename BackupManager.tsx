import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getBackupDownloadUrl, restoreBackupNow, runBackupNow } from "@/lib/integrations.functions";
import { supabase } from "@/integrations/supabase/client";

type BackupRun = {
  id: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  verified_at: string | null;
  file_path: string | null;
  size_bytes: number | null;
  table_counts: Record<string, number> | null;
  error: string | null;
  file_deleted_at: string | null;
  restored_at: string | null;
};

function formatBytes(value: number | null) {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupManager() {
  const qc = useQueryClient();
  const history = useQuery({
    queryKey: ["backup-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backup_runs")
        .select(
          "id, trigger, status, started_at, finished_at, verified_at, file_path, size_bytes, table_counts, error, file_deleted_at, restored_at",
        )
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as BackupRun[];
    },
  });

  async function createBackup() {
    try {
      const result = await runBackupNow();
      toast.success(`Backup verified: ${result.rows} rows included.`);
      await qc.invalidateQueries({ queryKey: ["backup-runs"] });
    } catch (error) {
      toast.error((error as Error).message || "Backup failed. Check the backup history.");
      await qc.invalidateQueries({ queryKey: ["backup-runs"] });
    }
  }

  async function download(runId: string) {
    try {
      const result = await getBackupDownloadUrl({ data: { runId } });
      window.location.assign(result.url);
    } catch (error) {
      toast.error((error as Error).message || "Could not prepare the backup download.");
    }
  }

  const restoreFn = useServerFn(restoreBackupNow);
  const [restoreTarget, setRestoreTarget] = useState<BackupRun | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);

  async function restore() {
    if (!restoreTarget || confirmText !== "RESTORE") return;
    setRestoring(true);
    try {
      const result = await restoreFn({ data: { runId: restoreTarget.id, confirm: "RESTORE" } });
      toast.success(
        `Backup restored: ${result.restored} rows put back${
          result.skipped ? `, ${result.skipped} skipped (accounts that no longer exist)` : ""
        }. A safety backup of the data before the restore was saved first.`,
      );
      setRestoreTarget(null);
      setConfirmText("");
      await qc.invalidateQueries();
    } catch (error) {
      toast.error((error as Error).message || "Restore failed. Nothing was changed.");
      await qc.invalidateQueries({ queryKey: ["backup-runs"] });
    } finally {
      setRestoring(false);
    }
  }

  const latestSuccess = history.data?.find((run) => run.status === "success");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Platform backups</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a verified backup of platform and school data. Backup execution requires the
            private storage bucket and server credentials to be configured.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Last successful backup:{" "}
            {latestSuccess?.verified_at
              ? new Date(latestSuccess.verified_at).toLocaleString()
              : "None recorded"}
          </p>
        </div>
        <Button onClick={createBackup} disabled={history.isFetching}>
          {history.isFetching ? "Loading history…" : "Create backup now"}
        </Button>
      </div>

      {history.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading backup history…</p>
      ) : history.error ? (
        <p className="text-sm text-destructive">
          Backup history could not be loaded. Confirm the Super Admin session and database
          migration.
        </p>
      ) : (history.data ?? []).length === 0 ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          No backups have been recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 font-medium">Started</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Size</th>
                <th className="p-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {(history.data ?? []).map((run) => (
                <tr key={run.id} className="border-t align-top">
                  <td className="p-3">{new Date(run.started_at).toLocaleString()}</td>
                  <td className="p-3 capitalize">{run.trigger}</td>
                  <td className="p-3">
                    <span
                      className={
                        run.status === "success"
                          ? "text-green-700"
                          : run.status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {run.status === "success" && run.verified_at ? "Verified" : run.status}
                    </span>
                    {run.restored_at && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Restored {new Date(run.restored_at).toLocaleString()}
                      </p>
                    )}
                    {run.error && (
                      <p className="mt-1 max-w-xs text-xs text-destructive">{run.error}</p>
                    )}
                  </td>
                  <td className="p-3">{formatBytes(run.size_bytes)}</td>
                  <td className="p-3">
                    {run.status === "success" && run.file_path && !run.file_deleted_at ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => download(run.id)}>
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setConfirmText("");
                            setRestoreTarget(run);
                          }}
                        >
                          Restore
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unavailable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog
        open={!!restoreTarget}
        onOpenChange={(open) => {
          if (!open && !restoring) setRestoreTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Backup from{" "}
                  <strong>
                    {restoreTarget ? new Date(restoreTarget.started_at).toLocaleString() : ""}
                  </strong>
                  .
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Records deleted since then are put back.</li>
                  <li>Records changed since then go back to how they were in the backup.</li>
                  <li>Records added after the backup are kept.</li>
                  <li>A new safety backup of today's data is saved first.</li>
                </ul>
                <p>If anything fails, nothing is changed.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="restore-confirm">Type RESTORE to confirm</Label>
            <Input
              id="restore-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              disabled={restoring}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirmText !== "RESTORE" || restoring}
              onClick={restore}
            >
              {restoring ? "Restoring…" : "Restore backup"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
