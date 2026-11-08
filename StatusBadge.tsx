import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/subscription";

const styles: Record<string, string> = {
  trial: "bg-secondary text-secondary-foreground",
  active: "bg-success text-success-foreground",
  read_only: "bg-warning text-warning-foreground",
  expired: "bg-warning text-warning-foreground",
  suspended: "bg-destructive text-destructive-foreground",
  archived: "bg-muted text-muted-foreground",
  pending: "bg-secondary text-secondary-foreground",
  approved: "bg-success text-success-foreground",
  confirmed: "bg-success text-success-foreground",
  rejected: "bg-destructive text-destructive-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={styles[status] ?? ""}>
      {statusLabel[status] ?? status.replace("_", "-")}
    </Badge>
  );
}
