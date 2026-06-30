import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dashboardSummary } from "@/lib/dashboard.functions";
import { listManualsWithStatus } from "@/lib/manuals.functions";
import { useActiveOrg } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/products" });
  },
  component: DashboardPage,
});

const TILES = [
  {
    key: "in_sync",
    label: "In sync",
    icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "out_of_sync",
    label: "Out of sync",
    icon: AlertTriangle,
    className: "text-rose-600 dark:text-rose-400",
  },
  {
    key: "pending_review",
    label: "Pending review",
    icon: Clock,
    className: "text-amber-600 dark:text-amber-400",
  },
] as const;

const STATUS_VARIANT: Record<string, { label: string; className: string }> = {
  in_sync: {
    label: "In sync",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  out_of_sync: {
    label: "Out of sync",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  },
  no_manual: {
    label: "No manual",
    className: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  },
  pending_review: {
    label: "Pending review",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
};

function DashboardPage() {
  const { orgId, hasActiveOrg } = useActiveOrg();
  const fetchSummary = useServerFn(dashboardSummary);
  const fetchManuals = useServerFn(listManualsWithStatus);

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", orgId],
    queryFn: () => fetchSummary({ data: { organizationId: orgId } }),
    enabled: hasActiveOrg,
  });
  const manualsQuery = useQuery({
    queryKey: ["recent-manuals", orgId],
    queryFn: () => fetchManuals({ data: { organizationId: orgId } }),
    enabled: hasActiveOrg,
  });

  const rows = (manualsQuery.data ?? []).slice(0, 10);

  if (!hasActiveOrg) {
    return (
      <div className="rounded-md border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Select an organization</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the org switcher in the header, or visit Platform Admin to pick
          one.
        </p>
      </div>
    );
  }

  const counts = summaryQuery.data?.counts ?? {
    in_sync: 0,
    out_of_sync: 0,
    pending_review: 0,
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Manual sync status across this organization, plus the most recently
          created manuals.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Card key={t.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t.label}
                </CardTitle>
                <Icon className={`h-4 w-4 ${t.className}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {(counts as any)[t.key] ?? 0}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Manual</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Latest version</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last publish</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {manualsQuery.isLoading && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!manualsQuery.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  No manuals yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((manual) => {
              const variant =
                STATUS_VARIANT[manual.sync_status] ?? STATUS_VARIANT.no_manual;
              return (
                <TableRow key={manual.manual_id}>
                  <TableCell>
                    <div className="font-mono text-sm">{manual.sku}</div>
                    <div className="text-sm text-muted-foreground">
                      {manual.product_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={variant.className} variant="secondary">
                      {variant.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {manual.latest_version_number != null ? (
                      <span>
                        v{manual.latest_version_number}
                        <span className="ml-1 text-muted-foreground">
                          · {manual.latest_version_state}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(manual.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {manual.last_published_at
                      ? formatDistanceToNow(
                          new Date(manual.last_published_at),
                          { addSuffix: true },
                        )
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to="/products/$productId"
                      params={{ productId: manual.product_id }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
