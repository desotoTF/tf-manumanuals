import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useActiveOrg } from "@/components/AppShell";
import {
  listErpConnections,
  listSyncEvents,
  validateConnection,
  createOdooConnection,
  rotateOdooCredentials,
  revokeOdooConnection,
  syncBoms,
} from "@/lib/erp.functions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plug,
  Zap,
  RefreshCcw,
  KeyRound,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/erp")({
  component: ErpPage,
});

function ErpPage() {
  const { orgId, isAdmin } = useActiveOrg();
  const qc = useQueryClient();
  const fetchConns = useServerFn(listErpConnections);
  const fetchEvents = useServerFn(listSyncEvents);

  const conns = useQuery({
    queryKey: ["erp-connections", orgId],
    queryFn: () => fetchConns({ data: { organizationId: orgId } }),
  });
  const events = useQuery({
    queryKey: ["sync-events", orgId],
    queryFn: () => fetchEvents({ data: { organizationId: orgId } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["erp-connections", orgId] });
    qc.invalidateQueries({ queryKey: ["sync-events", orgId] });
    qc.invalidateQueries({ queryKey: ["products", orgId] });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ERP Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Connect your ERP to keep BOMs in sync with manuals. Odoo is supported first.
          </p>
        </div>
        {isAdmin && <ConnectOdooDialog orgId={orgId} onCreated={refresh} />}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            Connections
          </CardTitle>
          <CardDescription>
            {conns.data?.length
              ? `${conns.data.length} configured`
              : "No ERP connections yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {conns.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : conns.data?.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
              <p className="text-sm font-medium">No ERP connected.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isAdmin
                  ? "Click 'Connect Odoo' above to add your first ERP."
                  : "Ask an admin to connect your Odoo instance."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {conns.data?.map((c) => (
                <ConnectionRow
                  key={c.id}
                  c={c}
                  isAdmin={isAdmin}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent sync events</CardTitle>
          <CardDescription>Latest 25 events across all connections.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !events.data || events.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {events.data.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded px-2 py-1.5 hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2">
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <EventBadge type={e.event_type} />
                    <span className="text-xs text-muted-foreground">
                      {summarizeEvent(e.event_type, e.payload)}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.occurred_at).toLocaleString()}
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

// --------------------------------------------------------------------------

type Conn = Awaited<ReturnType<typeof listErpConnections>>[number];

function ConnectionRow({
  c,
  isAdmin,
  onChanged,
}: {
  c: Conn;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const syncFn = useServerFn(syncBoms);
  const revokeFn = useServerFn(revokeOdooConnection);

  const syncMut = useMutation({
    mutationFn: () => syncFn({ data: { connectionId: c.id } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(
          `Sync complete: ${r.productsTouched} products, ${r.changed} new snapshots`,
        );
      } else {
        toast.error(`Sync failed: ${r.error}`);
      }
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: () => revokeFn({ data: { connectionId: c.id } }),
    onSuccess: () => {
      toast.success("Connection deleted");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = c.last_sync_status;
  const dot =
    status === "success"
      ? "bg-emerald-500"
      : status === "failed"
        ? "bg-destructive"
        : "bg-muted-foreground/40";

  return (
    <li className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <p className="truncate text-sm font-medium">{c.name}</p>
          {!c.is_active && <Badge variant="secondary">revoked</Badge>}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {c.provider} · {c.base_url} · db: {c.database ?? "—"} · user: {c.username}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {c.last_sync_at
            ? `Last sync ${new Date(c.last_sync_at).toLocaleString()}`
            : "Never synced"}
          {" · "}
          credentials v{c.credentials_version}
          {c.last_sync_error && (
            <span className="ml-2 text-destructive">· {c.last_sync_error}</span>
          )}
        </p>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!c.is_active || syncMut.isPending}
            onClick={() => syncMut.mutate()}
          >
            {syncMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Sync now
          </Button>
          <RotateDialog conn={c} onDone={onChanged} />
          <Button
            size="sm"
            variant="ghost"
            disabled={!c.is_active || revokeMut.isPending}
            onClick={() => {
              if (
                confirm(
                  `Revoke "${c.name}"? Credentials will be deleted and the connection deactivated.`,
                )
              ) {
                revokeMut.mutate();
              }
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )}
    </li>
  );
}

// --------------------------------------------------------------------------

function ConnectOdooDialog({
  orgId,
  onCreated,
}: {
  orgId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Odoo");
  const [baseUrl, setBaseUrl] = useState("");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [validated, setValidated] = useState<null | { ok: boolean; msg: string }>(
    null,
  );

  const validateFn = useServerFn(validateConnection);
  const createFn = useServerFn(createOdooConnection);

  const validateMut = useMutation({
    mutationFn: () =>
      validateFn({ data: { baseUrl, database, username, apiKey } }),
    onSuccess: (r) =>
      setValidated(
        r.ok
          ? { ok: true, msg: `Authenticated as Odoo uid ${r.uid}` }
          : { ok: false, msg: r.error },
      ),
    onError: (e: Error) => setValidated({ ok: false, msg: e.message }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          organizationId: orgId,
          name,
          baseUrl,
          database,
          username,
          apiKey,
        },
      }),
    onSuccess: () => {
      toast.success("Odoo connection created");
      setOpen(false);
      setName("Odoo");
      setBaseUrl("");
      setDatabase("");
      setUsername("");
      setApiKey("");
      setValidated(null);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    !!baseUrl && !!database && !!username && !!apiKey && !!name;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Zap className="mr-2 h-4 w-4" /> Connect Odoo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect Odoo</DialogTitle>
          <DialogDescription>
            Credentials are validated against your Odoo instance before being
            stored — encrypted at rest in the database vault. Create an API key
            in Odoo via Preferences → Account Security → New API Key.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <Field
            label="Connection name"
            value={name}
            onChange={setName}
            placeholder="Production Odoo"
          />
          <Field
            label="Base URL"
            value={baseUrl}
            onChange={(v) => {
              setBaseUrl(v);
              setValidated(null);
            }}
            placeholder="https://mycompany.odoo.com"
          />
          <Field
            label="Database"
            value={database}
            onChange={(v) => {
              setDatabase(v);
              setValidated(null);
            }}
            placeholder="mycompany"
          />
          <Field
            label="Username"
            value={username}
            onChange={(v) => {
              setUsername(v);
              setValidated(null);
            }}
            placeholder="user@mycompany.com"
          />
          <Field
            label="API key"
            value={apiKey}
            type="password"
            onChange={(v) => {
              setApiKey(v);
              setValidated(null);
            }}
            placeholder="••••••••"
          />
          {validated && (
            <div
              className={`flex items-center gap-2 rounded-md border p-2 text-xs ${
                validated.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {validated.ok ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <span>{validated.msg}</span>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={!canSubmit || validateMut.isPending}
            onClick={() => validateMut.mutate()}
          >
            {validateMut.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Test connection
          </Button>
          <Button
            disabled={!canSubmit || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RotateDialog({
  conn,
  onDone,
}: {
  conn: Conn;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const rotateFn = useServerFn(rotateOdooCredentials);
  const rotateMut = useMutation({
    mutationFn: () =>
      rotateFn({ data: { connectionId: conn.id, apiKey } }),
    onSuccess: () => {
      toast.success("API key rotated");
      setOpen(false);
      setApiKey("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!conn.is_active}>
          <KeyRound className="mr-2 h-4 w-4" /> Rotate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rotate API key</DialogTitle>
          <DialogDescription>
            The new key is validated against Odoo before it replaces the
            existing one. Currently version {conn.credentials_version}.
          </DialogDescription>
        </DialogHeader>
        <Field
          label="New API key"
          type="password"
          value={apiKey}
          onChange={setApiKey}
          placeholder="••••••••"
        />
        <DialogFooter>
          <Button
            disabled={!apiKey || rotateMut.isPending}
            onClick={() => rotateMut.mutate()}
          >
            {rotateMut.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Rotate key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function EventBadge({ type }: { type: string }) {
  const variant: Record<string, string> = {
    bom_sync_started: "bg-muted text-muted-foreground",
    bom_sync_succeeded: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    bom_sync_failed: "bg-destructive/15 text-destructive",
    bom_change_detected: "bg-primary/15 text-primary",
    manual_published: "bg-primary/15 text-primary",
    manual_state_changed: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
        variant[type] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {type}
    </span>
  );
}

function summarizeEvent(type: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (type) {
    case "bom_sync_succeeded":
      return `scanned ${p.scanned ?? 0}, ${p.changed ?? 0} new snapshots`;
    case "bom_sync_failed":
      return String(p.error ?? "");
    case "bom_change_detected":
      return `bom ${p.bom_id ?? ""}`;
    default:
      return "";
  }
}
