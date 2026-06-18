import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveOrg } from "@/components/AppShell";
import { listErpConnections } from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plug, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/erp")({
  component: ErpPage,
});

function ErpPage() {
  const { orgId, isAdmin } = useActiveOrg();
  const fetchConns = useServerFn(listErpConnections);
  const q = useQuery({
    queryKey: ["erp-connections", orgId],
    queryFn: () => fetchConns({ data: { organizationId: orgId } }),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ERP Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect your ERP to keep BOMs in sync with manuals. Odoo is supported first.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary" />
              Connections
            </CardTitle>
            <CardDescription>
              {q.data?.length
                ? `${q.data.length} configured`
                : "No ERP connections yet."}
            </CardDescription>
          </div>
          {isAdmin && (
            <Button disabled title="Phase II">
              <Zap className="mr-2 h-4 w-4" /> Connect Odoo (Phase II)
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : q.data?.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
              <p className="text-sm font-medium">No ERP connected.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Phase II will add the Odoo connect form, credential validation, and BOM sync.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {q.data?.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.provider} · {c.base_url}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {c.last_sync_at
                      ? `Last sync ${new Date(c.last_sync_at).toLocaleString()}`
                      : "Never synced"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
