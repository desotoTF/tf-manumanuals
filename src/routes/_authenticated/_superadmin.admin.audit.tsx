import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListAudit } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/_superadmin/admin/audit")({
  component: AdminAuditPage,
});

const KIND_COLOR: Record<string, string> = {
  platform: "bg-primary/15 text-primary",
  credential: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  sync: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};

function AdminAuditPage() {
  const fetchAudit = useServerFn(adminListAudit);
  const auditQuery = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => fetchAudit(),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Platform-admin actions, ERP credential events, and recent sync events
          across every tenant. Most recent 300 entries.
        </p>
      </header>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {auditQuery.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No audit entries yet.
                </TableCell>
              </TableRow>
            )}
            {auditQuery.data?.map((e) => (
              <TableRow key={`${e.kind}-${e.id}`}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={KIND_COLOR[e.kind] ?? ""}>
                    {e.kind}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{e.actor}</TableCell>
                <TableCell className="font-mono text-xs">{e.action}</TableCell>
                <TableCell className="max-w-xl">
                  <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {JSON.stringify(e.detail, null, 0)}
                  </pre>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
