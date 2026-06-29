// "Manuals" list page. Lives at /products for URL stability but the user-facing
// name is Manuals. Lists every manual in the org with status, latest version,
// and a "Create manual" button — SKU-first flow (no product picker).
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Plus, Search, Loader2 } from "lucide-react";
import { useActiveOrg } from "@/components/AppShell";
import { listManualsWithStatus, createManualFromSku } from "@/lib/manuals.functions";
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


export const Route = createFileRoute("/_authenticated/products")({
  component: ManualsPage,
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

function ManualsPage() {
  const { orgId } = useActiveOrg();
  const navigate = useNavigate();
  const fetchManuals = useServerFn(listManualsWithStatus);
  const [filter, setFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const manualsQuery = useQuery({
    queryKey: ["manuals", orgId],
    queryFn: () => fetchManuals({ data: { organizationId: orgId } }),
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {manualsQuery.isLoading && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!manualsQuery.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
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
  const fetchProducts = useServerFn(listProductsWithoutManual);
  const fetchTemplates = useServerFn(listTemplates);
  const createDraft = useServerFn(createManualDraft);

  const [productId, setProductId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>("__none");
  const [pickerOpen, setPickerOpen] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["products-without-manual", orgId],
    queryFn: () => fetchProducts({ data: { organizationId: orgId } }),
    enabled: open,
  });
  const templatesQuery = useQuery({
    queryKey: ["manual-templates", orgId],
    queryFn: () => fetchTemplates({ data: { organizationId: orgId } }),
    enabled: open,
  });

  const selectedProduct = useMemo(
    () => productsQuery.data?.find((p) => p.id === productId) ?? null,
    [productsQuery.data, productId],
  );

  const createMut = useMutation({
    mutationFn: (input: { productId: string; templateId?: string }) =>
      createDraft({ data: input }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["manuals", orgId] });
      toast.success("Manual created");
      onOpenChange(false);
      setProductId(null);
      setTemplateId("__none");
      navigate({
        to: "/products/$productId",
        params: { productId: vars.productId },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!productId) return;
    createMut.mutate({
      productId,
      templateId: templateId === "__none" ? undefined : templateId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create manual</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Product</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {selectedProduct
                    ? formatManualLabel(
                        selectedProduct.sku,
                        selectedProduct.name,
                      )
                    : "Select a product…"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search SKU or name…" />
                  <CommandList>
                    <CommandEmpty>
                      {productsQuery.isLoading
                        ? "Loading…"
                        : productsQuery.data?.length === 0
                          ? "No products available. Sync from Odoo in Settings → ERP first."
                          : "No matches."}
                    </CommandEmpty>
                    <CommandGroup>
                      {productsQuery.data?.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.sku} ${p.name}`}
                          onSelect={() => {
                            setProductId(p.id);
                            setPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              productId === p.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="font-mono text-sm">
                            {formatManualLabel(p.sku, p.name)}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="mt-1 text-xs text-muted-foreground">
              Only products that don't already have a manual are listed.
            </p>
          </div>

          <div>
            <Label>Template (optional)</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No template — blank</SelectItem>
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
            onClick={handleCreate}
            disabled={!productId || createMut.isPending}
          >
            {createMut.isPending ? "Creating…" : "Create manual"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
