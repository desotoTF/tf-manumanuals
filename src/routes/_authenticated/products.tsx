// "Manuals" list page. Lives at /products for URL stability but the user-facing
// name is Manuals. Lists every manual in the org with status, latest version,
// and a "Create manual" button — SKU-first flow (no product picker).
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Plus, Search, Loader2, Trash2 } from "lucide-react";
import { useActiveOrg } from "@/components/AppShell";
import {
  listManualsWithStatus,
  createManualFromSku,
  deleteManual,
} from "@/lib/manuals.functions";
import { lookupProductBySku } from "@/lib/products.functions";
import { listTemplates } from "@/lib/templates.functions";
import { formatManualLabel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsRoutePage,
});

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

function ProductsRoutePage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/products") return <Outlet />;
  return <ManualsPage />;
}

function ManualsPage() {
  const { orgId } = useActiveOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchManuals = useServerFn(listManualsWithStatus);
  const deleteManualFn = useServerFn(deleteManual);
  const [filter, setFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<{
    manualId: string;
    label: string;
  } | null>(null);

  const manualsQuery = useQuery({
    queryKey: ["manuals", orgId],
    queryFn: () => fetchManuals({ data: { organizationId: orgId } }),
  });

  const deleteMut = useMutation({
    mutationFn: (manualId: string) =>
      deleteManualFn({ data: { manualId } }),
    onSuccess: () => {
      toast.success("Manual deleted");
      qc.invalidateQueries({ queryKey: ["manuals", orgId] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const data = manualsQuery.data ?? [];
    if (!filter.trim()) return data;
    const q = filter.toLowerCase();
    return data.filter(
      (r) =>
        r.sku.toLowerCase().includes(q) ||
        r.product_name.toLowerCase().includes(q),
    );
  }, [manualsQuery.data, filter]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manuals</h1>
          <p className="text-sm text-muted-foreground">
            Every installation manual in your workspace. Click a row to edit;
            status reflects whether the published version matches the latest
            BOM.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create manual
        </Button>
      </header>

      <Input
        placeholder="Filter by SKU or product name…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Manual</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Latest version</TableHead>
              <TableHead>Last published</TableHead>
              <TableHead>Last BOM change</TableHead>
              <TableHead className="w-12" />
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
                  {manualsQuery.data?.length === 0
                    ? "No manuals yet. Click Create manual to start your first one."
                    : "No manuals match that filter."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const variant =
                STATUS_VARIANT[r.sync_status] ?? STATUS_VARIANT.no_manual;
              return (
                <TableRow
                  key={r.manual_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    navigate({
                      to: "/products/$productId",
                      params: { productId: r.product_id },
                    })
                  }
                >
                  <TableCell className="font-mono text-sm">
                    {formatManualLabel(r.sku, r.product_name)}
                  </TableCell>
                  <TableCell>
                    <Badge className={variant.className} variant="secondary">
                      {variant.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.latest_version_number != null ? (
                      <span>
                        v{r.latest_version_number}
                        <span className="ml-1 text-muted-foreground">
                          · {r.latest_version_state}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.last_published_at
                      ? formatDistanceToNow(new Date(r.last_published_at), {
                          addSuffix: true,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.last_bom_change_at
                      ? formatDistanceToNow(new Date(r.last_bom_change_at), {
                          addSuffix: true,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete manual"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setToDelete({
                          manualId: r.manual_id,
                          label: formatManualLabel(r.sku, r.product_name),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CreateManualDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
      />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && !deleteMut.isPending && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this manual?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.label
                ? `“${toDelete.label}” and every draft, version, image, and published PDF tied to it will be permanently removed. This can't be undone.`
                : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) deleteMut.mutate(toDelete.manualId);
              }}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete manual"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateManualDialog({
  open,
  onOpenChange,
  orgId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchTemplates = useServerFn(listTemplates);
  const lookupSku = useServerFn(lookupProductBySku);
  const createFromSku = useServerFn(createManualFromSku);

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>("__none");
  const [lookup, setLookup] = useState<{
    source: "local" | "odoo" | "odoo_variants" | "not_found";
    productId?: string;
    odooProductId?: string;
    odooTemplateId?: string;
    templateSku?: string;
    erpConnectionId?: string;
    variants?: Array<{ odooProductId: string; sku: string; name: string }>;
    variantTemplateSkus?: Record<string, string>;
    lookupError?: string;
  } | null>(null);
  // When the lookup returns multiple Odoo variants, the user picks one here.
  // Selecting a variant promotes it into the lookup state (source=odoo).
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [looking, setLooking] = useState(false);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setSku("");
      setName("");
      setTemplateId("__none");
      setLookup(null);
      setSelectedVariant("");
      setLooking(false);
    }
  }, [open]);

  const templatesQuery = useQuery({
    queryKey: ["manual-templates", orgId],
    queryFn: () => fetchTemplates({ data: { organizationId: orgId } }),
    enabled: open,
  });

  // Pre-select default template once the list loads.
  useEffect(() => {
    if (templateId !== "__none") return;
    const def = templatesQuery.data?.find((t) => t.is_default);
    if (def) setTemplateId(def.id);
  }, [templatesQuery.data, templateId]);

  const runLookup = async () => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    setLooking(true);
    setSelectedVariant("");
    try {
      const res = await lookupSku({
        data: { organizationId: orgId, sku: trimmed },
      });
      setLookup({
        source: res.source,
        productId: res.productId,
        odooProductId: res.odooProductId,
        odooTemplateId: res.odooTemplateId,
        templateSku: res.templateSku,
        erpConnectionId: res.erpConnectionId,
        variants: res.variants,
        variantTemplateSkus: res.variantTemplateSkus,
        lookupError: res.lookupError,
      });
      if (res.name) setName(res.name);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLooking(false);
    }
  };

  // If the lookup returned multiple variants, force the user to pick one
  // before allowing create. The chosen variant's odooProductId + SKU win.
  const needsVariantPick =
    lookup?.source === "odoo_variants" && !selectedVariant;
  const variantChoice =
    lookup?.variants?.find((v) => v.odooProductId === selectedVariant) ?? null;
  const effectiveOdooProductId =
    variantChoice?.odooProductId ?? lookup?.odooProductId;
  // When a variant is chosen, store the variant SKU as the local product SKU
  // (matches Odoo and unblocks BOM sync); keep the template SKU available for
  // future display fixes (parts list).
  const effectiveSku = variantChoice?.sku ?? sku.trim();

  const createMut = useMutation({
    mutationFn: () =>
      createFromSku({
        data: {
          organizationId: orgId,
          sku: effectiveSku,
          name: name.trim(),
          odooProductId: effectiveOdooProductId,
          erpConnectionId: lookup?.erpConnectionId,
          templateId: templateId === "__none" ? undefined : templateId,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["manuals", orgId] });
      if (res.alreadyExisted) {
        toast.info("Manual already exists for this SKU — opening it.");
      } else {
        toast.success("Manual created");
      }
      onOpenChange(false);
      navigate({
        to: "/products/$productId",
        params: { productId: res.productId },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canCreate =
    sku.trim().length > 0 && name.trim().length > 0 && !needsVariantPick;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create manual</DialogTitle>
          <DialogDescription>
            Enter the product SKU. We'll look it up in Odoo to auto-fill the
            name — edit it if you need to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sku">SKU</Label>
            <div className="flex gap-2">
              <Input
                id="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. AC-1234"
                onBlur={runLookup}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runLookup();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={runLookup}
                disabled={!sku.trim() || looking}
              >
                {looking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            {lookup && (
              <p className="text-xs text-muted-foreground">
                {lookup.source === "local" &&
                  "Matched an existing product in this workspace."}
                {lookup.source === "odoo" &&
                  "Found in Odoo — name auto-filled."}
                {lookup.source === "odoo_variants" &&
                  `Matched the base SKU ${lookup.templateSku ?? sku} in Odoo — pick a variant below.`}
                {lookup.source === "not_found" && (
                  <>
                    Not found{lookup.lookupError ? ` (${lookup.lookupError})` : ""}.
                    Enter the product name manually below.
                  </>
                )}
              </p>
            )}
          </div>

          {lookup?.source === "odoo_variants" && lookup.variants && (
            <div className="space-y-1">
              <Label>Variant</Label>
              <Select
                value={selectedVariant}
                onValueChange={setSelectedVariant}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a variant…" />
                </SelectTrigger>
                <SelectContent>
                  {lookup.variants.map((v) => (
                    <SelectItem key={v.odooProductId} value={v.odooProductId}>
                      <span className="font-mono text-xs">{v.sku}</span>
                      <span className="ml-2 text-muted-foreground">
                        {v.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The manual will use the variant SKU. The base SKU
                ({lookup.templateSku ?? sku}) is kept as the template
                reference for the parts list.
              </p>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="name">Product name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-fills from Odoo when the SKU is recognized"
            />
            {sku && name && (
              <p className="text-xs text-muted-foreground">
                Manual will be titled:{" "}
                <span className="font-mono">
                  {formatManualLabel(sku.trim(), name.trim())}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">
                  None — blank{!templatesQuery.data?.some((t) => t.is_default) ? " (default)" : ""}
                </SelectItem>
                {templatesQuery.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.is_default ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!canCreate || createMut.isPending}
          >
            {createMut.isPending ? "Creating…" : "Create manual"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

