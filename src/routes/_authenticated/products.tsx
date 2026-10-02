import { OnboardingChecklist } from "@/components/OnboardingChecklist";
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
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Copy, Pencil, Plus, Search, Loader2, Trash2, MoreHorizontal, FileText, Download, Upload } from "lucide-react";
import { useManualTransfer } from "@/lib/use-manual-transfer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveOrg } from "@/components/AppShell";
import {
  listManualsWithStatus,
  createManualFromSku,
  deleteManual,
  cloneManual,
  renameManual,
  getLockedManuals,
  type ManualListRow,
} from "@/lib/manuals.functions";
import { lookupProductBySku } from "@/lib/products.functions";
import { listTemplates } from "@/lib/templates.functions";
import {
  listEnabledImportModules,
  startVideoImport,
} from "@/lib/docsie.functions";
import { VideoImportPanel } from "@/components/manual-editor/ImportReviewDialog";
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


// Display-only mapping of existing version state + BOM sync status.
// Business logic and stored values are unchanged.
type StatusKey = "draft" | "in_review" | "approved" | "published" | "needs_review" | "no_manual";
const STATUS_KEYS: StatusKey[] = ["draft", "in_review", "approved", "published", "needs_review", "no_manual"];
const STATUS_DISPLAY: Record<StatusKey, { label: string; className: string; dot: string }> = {
  draft: { label: "Draft", className: "bg-slate-soft text-ink/80", dot: "bg-muted-foreground" },
  in_review: { label: "In review", className: "bg-amber-soft text-amber-ink", dot: "bg-amber" },
  approved: { label: "Approved", className: "bg-blue-soft text-ink", dot: "bg-primary" },
  published: { label: "Published · Current", className: "bg-teal-soft text-teal-ink", dot: "bg-teal" },
  needs_review: { label: "Published · Needs review", className: "bg-amber-soft text-amber-ink", dot: "bg-amber" },
  no_manual: { label: "No manual", className: "bg-slate-soft text-muted-foreground", dot: "bg-border" },
};
function displayStatus(r: ManualListRow): { key: StatusKey } {
  const st = r.latest_version_state;
  if (r.sync_status === "out_of_sync" || r.sync_status === "pending_review") {
    if (st === "published" || r.last_published_at) return { key: "needs_review" };
  }
  if (st === "in_review") return { key: "in_review" };
  if (st === "approved") return { key: "approved" };
  if (st === "published") return { key: "published" };
  if (st === "draft" || st === "superseded") return { key: "draft" };
  return { key: "no_manual" };
}
function StatusPill({ k }: { k: StatusKey }) {
  const d = STATUS_DISPLAY[k];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${d.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${d.dot}`} aria-hidden />
      {d.label}
    </span>
  );
}
const VISIBILITY_LABEL: Record<string, string> = {
  public_indexed: "Public",
  public_unlisted: "Unlisted",
  private: "Private",
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
  const cloneManualFn = useServerFn(cloneManual);
  const renameManualFn = useServerFn(renameManual);
  const [filter, setFilter] = useState("");
  const { exportManual, importManual } = useManualTransfer();
  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const runExport = async (manualId: string) => {
    const t = toast.loading("Preparing export…");
    try {
      const r = await exportManual(manualId);
      toast.success(r.missing ? `Exported — ${r.missing} image(s) couldn't be included` : "Manual exported", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { id: t });
    }
  };
  const runImport = async (file: File) => {
    setImporting(true);
    const t = toast.loading("Importing manual…");
    try {
      const r = await importManual(orgId, file);
      qc.invalidateQueries({ queryKey: ["manuals", orgId] });
      toast.success(r.missing ? `Imported — ${r.missing} image(s) were missing from the file` : "Manual imported as a draft", { id: t });
      navigate({ to: "/products/$productId", params: { productId: r.productId } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.replace(/^PLAN_LIMIT:\w+:/, ""), { id: t });
    } finally {
      setImporting(false);
    }
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<{
    manualId: string;
    label: string;
  } | null>(null);
  const [toClone, setToClone] = useState<{
    manualId: string;
    defaultTitle: string;
  } | null>(null);
  const [cloneTitle, setCloneTitle] = useState("");
  const [toRename, setToRename] = useState<{
    manualId: string;
    currentTitle: string;
  } | null>(null);
  const [renameTitle, setRenameTitle] = useState("");


  const manualsQuery = useQuery({
    queryKey: ["manuals", orgId],
    queryFn: () => fetchManuals({ data: { organizationId: orgId } }),
  });
  const fetchLocked = useServerFn(getLockedManuals);
  const lockedQ = useQuery({
    queryKey: ["locked-manuals", orgId],
    queryFn: () => fetchLocked({ data: { organizationId: orgId } }),
    enabled: !!orgId,
  });
  const locked = new Set(lockedQ.data ?? []);

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

  const cloneMut = useMutation({
    mutationFn: (vars: { manualId: string; title?: string }) =>
      cloneManualFn({ data: vars }),
    onSuccess: (res) => {
      toast.success("Manual cloned as a new draft");
      qc.invalidateQueries({ queryKey: ["manuals", orgId] });
      setToClone(null);
      navigate({
        to: "/products/$productId",
        params: { productId: res.productId },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameMut = useMutation({
    mutationFn: (vars: { manualId: string; title: string }) =>
      renameManualFn({ data: vars }),
    onSuccess: () => {
      toast.success("Manual renamed");
      qc.invalidateQueries({ queryKey: ["manuals", orgId] });
      setToRename(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "published" | "name">("updated");
  const all = (manualsQuery.data ?? []) as ManualListRow[];
  const showBom = all.some(
    (r) => r.sync_status === "in_sync" || r.sync_status === "out_of_sync" || !!r.last_bom_change_at,
  );
  const counts = useMemo(() => {
    const c = { in_review: 0, approved: 0, needs: 0 };
    all.forEach((r) => {
      const k = displayStatus(r).key;
      if (k === "in_review") c.in_review++;
      if (k === "approved") c.approved++;
      if (k === "needs_review") c.needs++;
    });
    return c;
  }, [all]);

  const rows = useMemo(() => {
    let data = all;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      data = data.filter(
        (r) => r.sku.toLowerCase().includes(q) || r.product_name.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") data = data.filter((r) => displayStatus(r).key === statusFilter);
    const sorted = data.slice();
    if (sortBy === "name") sorted.sort((a, b) => a.product_name.localeCompare(b.product_name));
    else if (sortBy === "published")
      sorted.sort((a, b) => (b.last_published_at ?? "").localeCompare(a.last_published_at ?? ""));
    else sorted.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
    return sorted;
  }, [all, filter, statusFilter, sortBy]);

  const filtersActive = !!filter.trim() || statusFilter !== "all";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">Workspace</p>
          <h1 className="font-display mt-1 text-3xl font-medium text-ink md:text-4xl">Manuals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, review, publish, and keep every manual current.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importInput}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) runImport(f);
            }}
          />
          <Button variant="outline" disabled={importing} onClick={() => importInput.current?.click()}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {importing ? "Importing…" : "Import"}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create manual
          </Button>
        </div>
      </header>

      {manualsQuery.data && all.length > 0 && (
        <OnboardingChecklist
          orgId={orgId}
          hasManual={all.length > 0}
          hasPublished={all.some((m) => !!m.last_published_at || m.latest_version_state === "published")}
        />
      )}

      {(counts.in_review > 0 || counts.needs > 0 || counts.approved > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber/30 bg-amber-soft px-4 py-3 text-sm" role="status">
          <span className="font-medium text-amber-ink">Needs attention:</span>
          {counts.in_review > 0 && (
            <button type="button" onClick={() => setStatusFilter("in_review")} className="rounded-full bg-card px-3 py-1 text-ink hover:underline">
              {counts.in_review} {counts.in_review === 1 ? "manual needs" : "manuals need"} review
            </button>
          )}
          {counts.needs > 0 && (
            <button type="button" onClick={() => setStatusFilter("needs_review")} className="rounded-full bg-card px-3 py-1 text-ink hover:underline">
              {counts.needs} out of sync with connected BOM
            </button>
          )}
          {counts.approved > 0 && (
            <button type="button" onClick={() => setStatusFilter("approved")} className="rounded-full bg-card px-3 py-1 text-ink hover:underline">
              {counts.approved} approved, ready to publish
            </button>
          )}
        </div>
      )}

      {manualsQuery.data && all.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <FileText className="mx-auto h-8 w-8 text-primary" aria-hidden />
          <h2 className="mt-4 text-xl font-semibold text-ink">Create your first manual</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Start from scratch, use a template, or bring in existing content.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create manual
            </Button>
            <Button variant="outline" asChild>
              <a href="/examples">View examples</a>
            </Button>
          </div>
        </div>
      ) : (
        <section aria-label="Manual library" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search manuals"
                aria-label="Search manuals"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44" aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>{STATUS_DISPLAY[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-44" aria-label="Sort"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Last updated</SelectItem>
                <SelectItem value="published">Last published</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={() => { setFilter(""); setStatusFilter("all"); }}>
                Clear filters
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Manual</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Version</TableHead>
                  <TableHead className="hidden md:table-cell">Last updated</TableHead>
                  <TableHead className="hidden lg:table-cell">Visibility</TableHead>
                  {showBom && <TableHead className="hidden lg:table-cell">BOM</TableHead>}
                  <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manualsQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                )}
                {!manualsQuery.isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No manuals match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const st = displayStatus(r);
                  const open = () =>
                    navigate({ to: "/products/$productId", params: { productId: r.product_id } });
                  return (
                    <TableRow
                      key={r.manual_id}
                      tabIndex={0}
                      className="cursor-pointer focus-visible:bg-accent"
                      onClick={open}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") open();
                      }}
                    >
                      <TableCell className="max-w-[18rem]">
                        <span className="block truncate font-medium text-ink">{r.product_name}</span>
                      </TableCell>
                      <TableCell>
                        <StatusPill k={st.key} />
                        {locked.has(r.manual_id) && (
                          <span
                            className="ml-1.5 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                            title="Over your plan's manual limit — read-only until you upgrade"
                          >
                            Locked
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden font-mono text-sm sm:table-cell">
                        {r.latest_version_number != null ? `v${r.latest_version_number}` : "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {r.updated_at ? formatDistanceToNow(new Date(r.updated_at), { addSuffix: true }) : "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {VISIBILITY_LABEL[r.visibility] ?? "—"}
                      </TableCell>
                      {showBom && (
                        <TableCell className="hidden text-xs lg:table-cell">
                          {r.sync_status === "out_of_sync" ? (
                            <span className="text-amber-ink">Out of sync</span>
                          ) : r.sync_status === "in_sync" ? (
                            <span className="text-muted-foreground">In sync</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${r.product_name}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={open}>Open</DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setRenameTitle(r.product_name);
                                setToRename({ manualId: r.manual_id, currentTitle: r.product_name });
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={cloneMut.isPending}
                              onSelect={() => {
                                const defaultTitle = `${r.product_name} (copy)`;
                                setCloneTitle(defaultTitle);
                                setToClone({ manualId: r.manual_id, defaultTitle });
                              }}
                            >
                              <Copy className="mr-2 h-4 w-4" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => runExport(r.manual_id)}>
                              <Download className="mr-2 h-4 w-4" /> Export (.zip)
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setToDelete({ manualId: r.manual_id, label: r.product_name })}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

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

      <Dialog
        open={!!toClone}
        onOpenChange={(o) => !o && !cloneMut.isPending && setToClone(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate manual</DialogTitle>
            <DialogDescription>
              A new draft will be created with the name below. You can edit it
              before or after cloning.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="clone-title">New manual name</Label>
            <Input
              id="clone-title"
              value={cloneTitle}
              onChange={(e) => setCloneTitle(e.target.value)}
              disabled={cloneMut.isPending}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToClone(null)}
              disabled={cloneMut.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={cloneMut.isPending || !cloneTitle.trim()}
              onClick={() => {
                if (!toClone) return;
                cloneMut.mutate({
                  manualId: toClone.manualId,
                  title: cloneTitle.trim(),
                });
              }}
            >
              {cloneMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Duplicating…
                </>
              ) : (
                "Duplicate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!toRename}
        onOpenChange={(o) => !o && !renameMut.isPending && setToRename(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename manual</DialogTitle>
            <DialogDescription>
              Update the display name of this manual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-title">Manual name</Label>
            <Input
              id="rename-title"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              disabled={renameMut.isPending}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToRename(null)}
              disabled={renameMut.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={
                renameMut.isPending ||
                !renameTitle.trim() ||
                renameTitle.trim() === toRename?.currentTitle
              }
              onClick={() => {
                if (!toRename) return;
                renameMut.mutate({
                  manualId: toRename.manualId,
                  title: renameTitle.trim(),
                });
              }}
            >
              {renameMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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
  // When lookup returns multiple Odoo products, the user picks the main
  // TF###### product. Variants/parts are intentionally not shown here.
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [looking, setLooking] = useState(false);
  // Automated creation modules (Docsie video import).
  const [source, setSource] = useState<"manual" | "docsie">("manual");
  const [videoUrl, setVideoUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);

  const fetchModules = useServerFn(listEnabledImportModules);
  const startImport = useServerFn(startVideoImport);
  const modulesQuery = useQuery({
    queryKey: ["import-modules", orgId],
    queryFn: () => fetchModules({ data: { organizationId: orgId } }),
    enabled: open,
  });
  const hasModules = (modulesQuery.data?.length ?? 0) > 0;

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setSku("");
      setName("");
      setTemplateId("__none");
      setLookup(null);
      setSelectedProduct("");
      setLooking(false);
      setSource("manual");
      setVideoUrl("");
      setJobId(null);
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
    setSelectedProduct("");
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

  // If lookup returned multiple products, force the user to pick one before
  // allowing create. The chosen product's main SKU is the manual SKU.
  const needsVariantPick =
    lookup?.source === "odoo_variants" && !selectedProduct;
  const productChoice =
    lookup?.variants?.find((v) => v.odooProductId === selectedProduct) ?? null;
  const effectiveOdooProductId =
    productChoice?.odooProductId ?? lookup?.odooProductId ?? lookup?.odooTemplateId;
  const effectiveSku = productChoice?.sku ?? lookup?.templateSku ?? sku.trim();
  const effectiveTemplateSku =
    (productChoice &&
      lookup?.variantTemplateSkus?.[productChoice.odooProductId]) ||
    lookup?.templateSku ||
    effectiveSku;

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await createFromSku({
        data: {
          organizationId: orgId,
          sku: effectiveSku,
          name: name.trim(),
          odooProductId: effectiveOdooProductId,
          erpConnectionId: lookup?.erpConnectionId,
          templateId: templateId === "__none" ? undefined : templateId,
          templateSku: effectiveTemplateSku,
        },
      });
      if (source === "docsie") {
        const job = await startImport({
          data: {
            organizationId: orgId,
            productId: res.productId,
            manualId: res.manualId,
            versionId: res.versionId,
            videoUrl: videoUrl.trim(),
            title: name.trim(),
          },
        });
        return { ...res, jobId: job.jobId };
      }
      return { ...res, jobId: null as string | null };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["manuals", orgId] });
      if (res.jobId) {
        toast.success("Manual created — importing the video");
        setJobId(res.jobId);
        return;
      }
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
    sku.trim().length > 0 &&
    name.trim().length > 0 &&
    !needsVariantPick &&
    (source !== "docsie" || videoUrl.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {jobId ? "Importing from video" : "Create manual"}
          </DialogTitle>
          <DialogDescription>
            {jobId
              ? "We're turning the video into draft sections you can review."
              : "Enter the product SKU. We'll look it up in Odoo to auto-fill the name — edit it if you need to."}
          </DialogDescription>
        </DialogHeader>

        {jobId ? (
          <VideoImportPanel
            jobId={jobId}
            onCancel={() => onOpenChange(false)}
            onDone={(productId) => {
              qc.invalidateQueries({ queryKey: ["manuals", orgId] });
              onOpenChange(false);
              navigate({
                to: "/products/$productId",
                params: { productId },
              });
            }}
          />
        ) : (
        <>
        <div className="space-y-4">
          {hasModules && (
            <div className="space-y-1">
              <Label>Create from</Label>
              <Select
                value={source}
                onValueChange={(v) => setSource(v as "manual" | "docsie")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual creation</SelectItem>
                  <SelectItem value="docsie">Video (Docsie)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {source === "docsie" && (
            <div className="space-y-1">
              <Label htmlFor="video-url">URL (YouTube)</Label>
              <Input
                id="video-url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
              />
              <p className="text-xs text-muted-foreground">
                We check the link before starting. Processing can take a few
                minutes.
              </p>
            </div>
          )}

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
                  "Matched multiple main products in Odoo — pick one below."}
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
              <Label>Product</Label>
              <Select
                value={selectedProduct}
                onValueChange={setSelectedProduct}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a product…" />
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
                The manual will use only the main TF###### SKU.
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
                  {formatManualLabel(effectiveSku.trim(), name.trim())}
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
            {createMut.isPending
              ? source === "docsie"
                ? "Starting…"
                : "Creating…"
              : source === "docsie"
                ? "Create & import"
                : "Create manual"}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

