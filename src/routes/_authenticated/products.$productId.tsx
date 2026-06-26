// 3-column manual editor for a product.
//   Left rail:  product summary + latest BOM snapshot items + version list
//   Main:       structured manual content editor (tools / parts / steps / warnings / torque / images)
//   Right rail: version state controls, change summary, drift warning
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getProductWorkspace,
  getManualVersion,
  createManualDraft,
  saveDraftContent,
  transitionManualVersion,
  addManualAsset,
  removeManualAsset,
  importLegacyManualFromPdf,
} from "@/lib/manuals.functions";
import { listTemplates } from "@/lib/templates.functions";
import { useActiveOrg } from "@/components/AppShell";
import { emptyManualContent, type ManualContent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Plus,
  Save,
  Send,
  CheckCircle2,
  Globe,
  Trash2,
  Upload,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/products/$productId")({
  component: ProductEditorPage,
});

const STATE_VARIANT: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  in_review: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  superseded: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

function ProductEditorPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { orgId } = useActiveOrg();
  const fetchWorkspace = useServerFn(getProductWorkspace);
  const fetchVersion = useServerFn(getManualVersion);
  const createDraft = useServerFn(createManualDraft);
  const saveDraft = useServerFn(saveDraftContent);
  const transition = useServerFn(transitionManualVersion);
  const addAsset = useServerFn(addManualAsset);
  const removeAsset = useServerFn(removeManualAsset);
  const importPdf = useServerFn(importLegacyManualFromPdf);
  const fetchTemplates = useServerFn(listTemplates);

  const workspaceQuery = useQuery({
    queryKey: ["product-workspace", productId],
    queryFn: () => fetchWorkspace({ data: { productId } }),
  });

  const templatesQuery = useQuery({
    queryKey: ["manual-templates", orgId],
    queryFn: () => fetchTemplates({ data: { organizationId: orgId } }),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);

  // Pick the most recent version (draft preferred) when workspace loads.
  useEffect(() => {
    if (activeVersionId || !workspaceQuery.data) return;
    const versions = workspaceQuery.data.versions;
    if (!versions.length) return;
    const draft = versions.find((v) => v.state === "draft");
    setActiveVersionId(draft?.id ?? versions[0].id);
  }, [workspaceQuery.data, activeVersionId]);

  const versionQuery = useQuery({
    queryKey: ["manual-version", activeVersionId],
    queryFn: () =>
      activeVersionId
        ? fetchVersion({ data: { versionId: activeVersionId } })
        : Promise.resolve(null),
    enabled: !!activeVersionId,
  });

  // Editable local content state mirrors the loaded version.
  const [content, setContent] = useState<ManualContent>(emptyManualContent());
  const [changeSummary, setChangeSummary] = useState("");

  useEffect(() => {
    if (!versionQuery.data) return;
    const c = {
      ...emptyManualContent(),
      ...((versionQuery.data.version.content ?? {}) as object),
    } as ManualContent;
    setContent(c);
    setChangeSummary(versionQuery.data.version.change_summary ?? "");
  }, [versionQuery.data]);

  const activeVersion = versionQuery.data?.version;
  const assets = versionQuery.data?.assets ?? [];
  const editable =
    activeVersion?.state === "draft" || activeVersion?.state === "in_review";

  const createMut = useMutation({
    mutationFn: (input: { manualId?: string }) =>
      createDraft({ data: { productId, ...input } }),
    onSuccess: ({ versionId }) => {
      setActiveVersionId(versionId);
      qc.invalidateQueries({ queryKey: ["product-workspace", productId] });
      toast.success("Draft created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      saveDraft({
        data: {
          versionId: activeVersionId!,
          content: content as unknown as Record<string, unknown>,
          changeSummary: changeSummary || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Draft saved");
      qc.invalidateQueries({ queryKey: ["manual-version", activeVersionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transitionMut = useMutation({
    mutationFn: (action: "submit" | "approve" | "publish" | "discard") =>
      transition({ data: { versionId: activeVersionId!, action } }),
    onSuccess: (res, action) => {
      toast.success(
        action === "discard" ? "Draft discarded" : `Moved to ${res.state}`,
      );
      if (action === "discard") setActiveVersionId(null);
      qc.invalidateQueries({ queryKey: ["product-workspace", productId] });
      qc.invalidateQueries({ queryKey: ["manual-version", activeVersionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addAssetMut = useMutation({
    mutationFn: (input: { url: string; caption?: string }) =>
      addAsset({
        data: { versionId: activeVersionId!, url: input.url, caption: input.caption },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-version", activeVersionId] });
      toast.success("Image added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAssetMut = useMutation({
    mutationFn: (assetId: string) => removeAsset({ data: { assetId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-version", activeVersionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (workspaceQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (workspaceQuery.error)
    return (
      <p className="text-sm text-destructive">
        {(workspaceQuery.error as Error).message}
      </p>
    );

  const ws = workspaceQuery.data!;
  const manuals = ws.manuals;
  const primaryManual = manuals[0];
  const isOutOfSync = ws.status?.status === "out_of_sync";

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate({ to: "/dashboard" })}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Back to dashboard
          </button>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            <span className="font-mono text-base text-muted-foreground">
              {ws.product.sku}
            </span>{" "}
            · {ws.product.name}
          </h1>
          {ws.product.description && (
            <p className="text-sm text-muted-foreground">
              {ws.product.description}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {!primaryManual && (
            <Button onClick={() => createMut.mutate({})} disabled={createMut.isPending}>
              <Plus className="mr-2 h-4 w-4" /> Create manual
            </Button>
          )}
          {primaryManual &&
            !ws.versions.some((v) => v.state === "draft") && (
              <Button
                variant="outline"
                onClick={() => createMut.mutate({ manualId: primaryManual.id })}
                disabled={createMut.isPending}
              >
                <Plus className="mr-2 h-4 w-4" /> New draft version
              </Button>
            )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* LEFT RAIL */}
        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Latest BOM</CardTitle>
            </CardHeader>
            <CardContent className="text-xs">
              {ws.latestBom ? (
                <>
                  <div className="mb-2 text-muted-foreground">
                    Captured{" "}
                    {formatDistanceToNow(new Date(ws.latestBom.captured_at), {
                      addSuffix: true,
                    })}
                    {ws.latestBom.erp_bom_revision && (
                      <> · rev {ws.latestBom.erp_bom_revision}</>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {((ws.latestBom.normalized_items as any[]) ?? [])
                      .slice(0, 20)
                      .map((it, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="truncate font-mono">
                            {it.part_number}
                          </span>
                          <span className="text-muted-foreground">×{it.qty}</span>
                        </li>
                      ))}
                  </ul>
                </>
              ) : (
                <p className="text-muted-foreground">No BOM synced yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Versions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {ws.versions.length === 0 && (
                <p className="text-muted-foreground">No versions yet.</p>
              )}
              {ws.versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setActiveVersionId(v.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-muted ${
                    activeVersionId === v.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="font-medium">v{v.version_number}</span>
                  <Badge
                    variant="secondary"
                    className={STATE_VARIANT[v.state] ?? ""}
                  >
                    {v.state}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        </aside>

        {/* MAIN */}
        <section>
          {!activeVersion ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {primaryManual
                  ? "Select a version on the left, or start a new draft."
                  : "No manual yet. Click 'Create manual' to start v1."}
              </CardContent>
            </Card>
          ) : (
            <ContentEditor
              content={content}
              setContent={setContent}
              editable={!!editable}
              assets={assets}
              onAddAsset={(url, caption) => addAssetMut.mutate({ url, caption })}
              onRemoveAsset={(id) => removeAssetMut.mutate(id)}
            />
          )}
        </section>

        {/* RIGHT RAIL */}
        <aside className="space-y-4">
          {isOutOfSync && (
            <Card className="border-rose-500/40 bg-rose-500/5">
              <CardContent className="flex gap-2 py-3 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <div>
                  <p className="font-medium text-rose-700 dark:text-rose-400">
                    Out of sync
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    The latest BOM differs from the published manual. Create a
                    new draft to bring it into sync.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeVersion && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  Version {activeVersion.version_number}
                  <Badge
                    variant="secondary"
                    className={STATE_VARIANT[activeVersion.state]}
                  >
                    {activeVersion.state}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <label className="mb-1 block font-medium">
                    Change summary
                  </label>
                  <Textarea
                    rows={3}
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    disabled={!editable}
                    placeholder="What changed in this revision?"
                  />
                </div>
                <div className="text-muted-foreground">
                  Updated{" "}
                  {formatDistanceToNow(new Date(activeVersion.updated_at), {
                    addSuffix: true,
                  })}
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveMut.mutate()}
                    disabled={!editable || saveMut.isPending}
                  >
                    <Save className="mr-2 h-4 w-4" /> Save draft
                  </Button>
                  {activeVersion.state === "draft" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => transitionMut.mutate("submit")}
                        disabled={transitionMut.isPending}
                      >
                        <Send className="mr-2 h-4 w-4" /> Submit for review
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => transitionMut.mutate("discard")}
                        disabled={transitionMut.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Discard draft
                      </Button>
                    </>
                  )}
                  {activeVersion.state === "in_review" && (
                    <Button
                      size="sm"
                      onClick={() => transitionMut.mutate("approve")}
                      disabled={transitionMut.isPending}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                    </Button>
                  )}
                  {(activeVersion.state === "approved" ||
                    activeVersion.state === "in_review") && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => transitionMut.mutate("publish")}
                      disabled={transitionMut.isPending}
                    >
                      <Globe className="mr-2 h-4 w-4" /> Publish
                    </Button>
                  )}
                </div>

                {activeVersion.state === "published" && ws.product.web_slug && (
                  <a
                    href={`/manuals/${ws.product.web_slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs font-medium text-primary hover:underline"
                  >
                    View public page →
                  </a>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------- Structured content editor ----------

function ContentEditor({
  content,
  setContent,
  editable,
  assets,
  onAddAsset,
  onRemoveAsset,
}: {
  content: ManualContent;
  setContent: (c: ManualContent) => void;
  editable: boolean;
  assets: { id: string; type: string; url: string | null; metadata: any }[];
  onAddAsset: (url: string, caption?: string) => void;
  onRemoveAsset: (id: string) => void;
}) {
  const [tab, setTab] = useState<
    "steps" | "tools" | "parts" | "warnings" | "torque" | "images"
  >("steps");

  const update = <K extends keyof ManualContent>(
    key: K,
    value: ManualContent[K],
  ) => setContent({ ...content, [key]: value });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap gap-1">
          {(
            [
              "steps",
              "tools",
              "parts",
              "warnings",
              "torque",
              "images",
            ] as const
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {tab === "steps" && (
          <StepsEditor
            steps={content.steps}
            setSteps={(s) => update("steps", s)}
            editable={editable}
          />
        )}
        {tab === "tools" && (
          <SimpleListEditor
            items={content.tools}
            setItems={(items) => update("tools", items)}
            editable={editable}
            columns={[
              { key: "name", label: "Tool", placeholder: "10mm wrench" },
              { key: "spec", label: "Spec", placeholder: "Torque-rated" },
            ]}
            empty={(): ManualContent["tools"][number] => ({ name: "" })}
          />
        )}
        {tab === "parts" && (
          <SimpleListEditor
            items={content.parts}
            setItems={(items) => update("parts", items)}
            editable={editable}
            columns={[
              { key: "part_number", label: "Part #", placeholder: "P-001" },
              { key: "qty", label: "Qty", placeholder: "1", numeric: true },
              { key: "description", label: "Description" },
              { key: "notes", label: "Notes" },
            ]}
            empty={(): ManualContent["parts"][number] => ({ part_number: "", qty: 1 })}
          />
        )}
        {tab === "warnings" && (
          <WarningsEditor
            warnings={content.warnings}
            setWarnings={(w) => update("warnings", w)}
            editable={editable}
          />
        )}
        {tab === "torque" && (
          <SimpleListEditor
            items={content.torque_specs}
            setItems={(items) => update("torque_specs", items)}
            editable={editable}
            columns={[
              { key: "fastener", label: "Fastener", placeholder: "M8 bolt" },
              { key: "value", label: "Value", placeholder: "25", numeric: true },
              { key: "unit", label: "Unit", placeholder: "Nm" },
              { key: "sequence", label: "Sequence" },
            ]}
            empty={(): ManualContent["torque_specs"][number] => ({ fastener: "", value: 0, unit: "Nm" })}
          />
        )}
        {tab === "images" && (
          <ImagesPanel
            assets={assets}
            editable={editable}
            onAdd={onAddAsset}
            onRemove={onRemoveAsset}
          />
        )}
      </CardContent>
    </Card>
  );
}

function StepsEditor({
  steps,
  setSteps,
  editable,
}: {
  steps: ManualContent["steps"];
  setSteps: (s: ManualContent["steps"]) => void;
  editable: boolean;
}) {
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.id} className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Step {i + 1}
            </span>
            {editable && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...steps];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    setSteps(next);
                  }}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={i === steps.length - 1}
                  onClick={() => {
                    const next = [...steps];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    setSteps(next);
                  }}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <Input
            value={s.title}
            onChange={(e) => {
              const next = [...steps];
              next[i] = { ...s, title: e.target.value };
              setSteps(next);
            }}
            disabled={!editable}
            placeholder="Step title"
            className="mb-2"
          />
          <Textarea
            value={s.body}
            rows={3}
            onChange={(e) => {
              const next = [...steps];
              next[i] = { ...s, body: e.target.value };
              setSteps(next);
            }}
            disabled={!editable}
            placeholder="Describe what the installer does in this step."
          />
        </div>
      ))}
      {editable && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setSteps([
              ...steps,
              {
                id:
                  typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `s-${Date.now()}`,
                title: "",
                body: "",
              },
            ])
          }
        >
          <Plus className="mr-2 h-4 w-4" /> Add step
        </Button>
      )}
    </div>
  );
}

function SimpleListEditor<T extends Record<string, any>>({
  items,
  setItems,
  editable,
  columns,
  empty,
}: {
  items: T[];
  setItems: (items: T[]) => void;
  editable: boolean;
  columns: { key: keyof T & string; label: string; placeholder?: string; numeric?: boolean }[];
  empty: () => T;
}) {
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">None yet.</p>
      )}
      {items.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {columns.map((c) => (
            <Input
              key={c.key}
              value={row[c.key] ?? ""}
              placeholder={c.placeholder ?? c.label}
              disabled={!editable}
              onChange={(e) => {
                const next = [...items];
                const v = c.numeric ? Number(e.target.value) : e.target.value;
                next[i] = { ...row, [c.key]: v } as T;
                setItems(next);
              }}
              className="h-8 max-w-[180px] text-sm"
            />
          ))}
          {editable && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {editable && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setItems([...items, empty()])}
        >
          <Plus className="mr-2 h-4 w-4" /> Add row
        </Button>
      )}
    </div>
  );
}

function WarningsEditor({
  warnings,
  setWarnings,
  editable,
}: {
  warnings: ManualContent["warnings"];
  setWarnings: (w: ManualContent["warnings"]) => void;
  editable: boolean;
}) {
  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2">
          <Select
            value={w.severity}
            onValueChange={(v: any) => {
              const next = [...warnings];
              next[i] = { ...w, severity: v };
              setWarnings(next);
            }}
            disabled={!editable}
          >
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="caution">Caution</SelectItem>
              <SelectItem value="danger">Danger</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            rows={2}
            value={w.body}
            onChange={(e) => {
              const next = [...warnings];
              next[i] = { ...w, body: e.target.value };
              setWarnings(next);
            }}
            disabled={!editable}
            className="flex-1"
          />
          {editable && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setWarnings(warnings.filter((_, j) => j !== i))}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {editable && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWarnings([...warnings, { severity: "info", body: "" }])}
        >
          <Plus className="mr-2 h-4 w-4" /> Add warning
        </Button>
      )}
    </div>
  );
}

function ImagesPanel({
  assets,
  editable,
  onAdd,
  onRemove,
}: {
  assets: { id: string; type: string; url: string | null; metadata: any }[];
  editable: boolean;
  onAdd: (url: string, caption?: string) => void;
  onRemove: (id: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  return (
    <div className="space-y-3">
      {assets.length === 0 && (
        <p className="text-xs text-muted-foreground">No images attached.</p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {assets.map((a) => (
          <figure key={a.id} className="rounded-md border border-border p-2">
            {a.url && (
              <img
                src={a.url}
                alt={a.metadata?.caption ?? ""}
                className="aspect-video w-full rounded object-cover"
              />
            )}
            <figcaption className="mt-1 truncate text-xs text-muted-foreground">
              {a.metadata?.caption ?? a.url}
            </figcaption>
            {editable && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove(a.id)}
                className="mt-1 h-7 w-full text-destructive"
              >
                <Trash2 className="mr-1 h-3 w-3" /> Remove
              </Button>
            )}
          </figure>
        ))}
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="https://image-url.jpg"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-8 max-w-sm text-sm"
          />
          <Input
            placeholder="Caption (optional)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="h-8 max-w-xs text-sm"
          />
          <Button
            size="sm"
            onClick={() => {
              if (!url.trim()) return;
              onAdd(url.trim(), caption.trim() || undefined);
              setUrl("");
              setCaption("");
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add image
          </Button>
        </div>
      )}
    </div>
  );
}
