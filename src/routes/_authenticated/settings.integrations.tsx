// Per-org third-party modules. Docsie (video → manual) is the first one.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Blocks,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Trash2,
  Zap,
} from "lucide-react";
import { useActiveOrg } from "@/components/AppShell";
import {
  listIntegrationConnections,
  saveDocsieConnection,
  testDocsieConnection,
  removeDocsieConnection,
} from "@/lib/docsie.functions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { orgId, isAdmin } = useActiveOrg();
  const qc = useQueryClient();
  const fetchConns = useServerFn(listIntegrationConnections);
  const save = useServerFn(saveDocsieConnection);
  const test = useServerFn(testDocsieConnection);
  const remove = useServerFn(removeDocsieConnection);

  const conns = useQuery({
    queryKey: ["integration-connections", orgId],
    queryFn: () => fetchConns({ data: { organizationId: orgId } }),
  });

  const docsie = conns.data?.find((c) => c.provider === "docsie") ?? null;

  const [apiKey, setApiKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["integration-connections", orgId] });
    qc.invalidateQueries({ queryKey: ["import-modules", orgId] });
  };

  const saveMut = useMutation({
    mutationFn: (vars: { isActive?: boolean; withKey?: boolean }) =>
      save({
        data: {
          organizationId: orgId,
          workspaceId: (workspaceId || docsie?.workspace_id) ?? null,
          ...(vars.withKey && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(vars.isActive === undefined ? {} : { isActive: vars.isActive }),
        },
      }),
    onSuccess: () => {
      setApiKey("");
      toast.success("Docsie settings saved");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => test({ data: { connectionId: docsie!.id } }),
    onSuccess: (res) => {
      if (res.ok) toast.success("Docsie connection works");
      else toast.error(res.error ?? "Connection failed");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: () => remove({ data: { connectionId: docsie!.id } }),
    onSuccess: () => {
      toast.success("Docsie disconnected");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Optional modules that add new ways to build manuals.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Blocks className="h-5 w-5 text-primary" />
                Docsie — Video to manual
              </CardTitle>
              <CardDescription>
                Turn an assembly video into draft manual sections. When enabled,
                "Create from" appears on the Create manual screen.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {docsie?.has_credentials ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                  Key stored
                </Badge>
              ) : (
                <Badge variant="outline">No key</Badge>
              )}
              <Switch
                checked={Boolean(docsie?.is_active)}
                disabled={!isAdmin || saveMut.isPending}
                onCheckedChange={(v) => saveMut.mutate({ isActive: v })}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {conns.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {docsie?.last_test_status && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {docsie.last_test_status === "ok" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              )}
              Last test: {docsie.last_test_status}
              {docsie.last_test_error ? ` — ${docsie.last_test_error}` : ""}
            </p>
          )}

          {isAdmin ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="docsie-key">
                  API key{docsie?.has_credentials ? " (replace)" : ""}
                </Label>
                <Input
                  id="docsie-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Docsie → Settings → Developer → API Keys"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="docsie-ws">Workspace ID (optional)</Label>
                <Input
                  id="docsie-ws"
                  value={workspaceId || (docsie?.workspace_id ?? "")}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  placeholder="Leave blank for the default workspace"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only owners and admins can change integration settings.
            </p>
          )}
        </CardContent>

        {isAdmin && (
          <CardContent className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              onClick={() => saveMut.mutate({ withKey: true })}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
            <Button
              variant="outline"
              onClick={() => testMut.mutate()}
              disabled={!docsie?.has_credentials || testMut.isPending}
            >
              {testMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              Test connection
            </Button>
            {docsie && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => removeMut.mutate()}
                disabled={removeMut.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
