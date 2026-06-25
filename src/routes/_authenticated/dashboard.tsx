import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { dashboardSummary } from "@/lib/dashboard.functions";
import { listProductsWithStatus } from "@/lib/products.functions";
import { useActiveOrg } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, AlertTriangle, FileX, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
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
  {
    key: "no_manual",
    label: "No manual",
    icon: FileX,
    className: "text-slate-600 dark:text-slate-300",
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

// Sort priority: out_of_sync first, then pending_review, no_manual, in_sync.
const STATUS_RANK: Record<string, number> = {
  out_of_sync: 0,
  pending_review: 1,
  no_manual: 2,
  in_sync: 3,
};

function DashboardPage() {
  const { orgId, hasActiveOrg } = useActiveOrg();
  const fetchSummary = useServerFn(dashboardSummary);
  const fetchProducts = useServerFn(listProductsWithStatus);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", orgId],
    queryFn: () => fetchSummary({ data: { organizationId: orgId } }),
    enabled: hasActiveOrg,
  });
  const productsQuery = useQuery({
    queryKey: ["products", orgId],
    queryFn: () => fetchProducts({ data: { organizationId: orgId } }),
    enabled: hasActiveOrg,
  });

  const rows = useMemo(() => {
    const items = (productsQuery.data ?? []).map((p) => ({
      ...p,
      status: (p.sync_status?.status ?? "no_manual") as string,
    }));
    const filtered = items.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        p.sku?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q)
      );
    });
    filtered.sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99) ||
        a.sku.localeCompare(b.sku),
    );
    return filtered;
  }, [productsQuery.data, search, statusFilter]);

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
    no_manual: 0,
    pending_review: 0,
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Manual sync status across this organization. Out-of-sync products
          appear first.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search SKU or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="out_of_sync">Out of sync</SelectItem>
            <SelectItem value="pending_review">Pending review</SelectItem>
            <SelectItem value="no_manual">No manual</SelectItem>
            <SelectItem value="in_sync">In sync</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last BOM change</TableHead>
              <TableHead>Last publish</TableHead>
              <TableHead>Out-of-sync since</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productsQuery.isLoading && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!productsQuery.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-sm text-muted-foreground"
                >
                  No products match.
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => {
              const variant =
                STATUS_VARIANT[p.status] ?? STATUS_VARIANT.no_manual;
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.sku}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>
                    <Badge className={variant.className} variant="secondary">
                      {variant.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.sync_status?.last_bom_change_at
                      ? formatDistanceToNow(
                          new Date(p.sync_status.last_bom_change_at),
                          { addSuffix: true },
                        )
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.sync_status?.last_manual_publish_at
                      ? formatDistanceToNow(
                          new Date(p.sync_status.last_manual_publish_at),
                          { addSuffix: true },
                        )
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.sync_status?.out_of_sync_since
                      ? formatDistanceToNow(
                          new Date(p.sync_status.out_of_sync_since),
                          { addSuffix: true },
                        )
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to="/products/$productId"
                      params={{ productId: p.id }}
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
