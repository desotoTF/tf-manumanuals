import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProductsWithStatus } from "@/lib/products.functions";
import { useActiveOrg } from "@/components/AppShell";
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

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

const STATUS_VARIANT: Record<
  string,
  { label: string; className: string }
> = {
  in_sync: { label: "In sync", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  out_of_sync: { label: "Out of sync", className: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  no_manual: { label: "No manual", className: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  pending_review: { label: "Pending review", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
};

function ProductsPage() {
  const { orgId } = useActiveOrg();
  const fetchProducts = useServerFn(listProductsWithStatus);
  const productsQuery = useQuery({
    queryKey: ["products", orgId],
    queryFn: () => fetchProducts({ data: { organizationId: orgId } }),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-sm text-muted-foreground">
          SKUs synced from your ERP. Status reflects whether the published manual
          matches the latest BOM snapshot.
        </p>
      </header>

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {productsQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {productsQuery.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No products yet. Connect Odoo in Settings → ERP to sync SKUs.
                </TableCell>
              </TableRow>
            )}
            {productsQuery.data?.map((p) => {
              const status = p.sync_status?.status ?? "no_manual";
              const variant = STATUS_VARIANT[status] ?? STATUS_VARIANT.no_manual;
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
                      ? formatDistanceToNow(new Date(p.sync_status.last_bom_change_at), { addSuffix: true })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.sync_status?.last_manual_publish_at
                      ? formatDistanceToNow(new Date(p.sync_status.last_manual_publish_at), { addSuffix: true })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.sync_status?.out_of_sync_since
                      ? formatDistanceToNow(new Date(p.sync_status.out_of_sync_since), { addSuffix: true })
                      : "—"}
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
