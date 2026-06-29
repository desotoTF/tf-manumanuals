// 3-column manual editor for a product.
//   Left rail:  product summary + latest BOM snapshot items + version list
//   Main:       structured manual content editor (tools / parts / steps / warnings / torque / images)
//   Right rail: version state controls, change summary, drift warning
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getProductWorkspace,
  getManualVersion,
  createManualDraft,
  saveDraftContent,
  transitionManualVersion,
  addManualAsset,
  removeManualAsset,
  uploadManualAssetFile,
  importLegacyManualFromPdf,
  loadBomForManual,
} from "@/lib/manuals.functions";
import { listTools, upsertTool } from "@/lib/tools.functions";
import {
  PartsListEditor,
  ToolsListEditor,
} from "@/components/manual-editor/ManualListEditors";

import { listTemplates } from "@/lib/templates.functions";
import { useActiveOrg } from "@/components/AppShell";
import { emptyManualContent, type ManualContent, newStepBlock, type StepBlock } from "@/lib/types";
import { useFigureMap } from "@/lib/figure-refs";
import { FigureRefField } from "@/components/manual-editor/FigureRefField";
import { StepBlocksEditor } from "@/components/manual-editor/StepBlocksEditor";

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
  Eye,
  Printer,
} from "lucide-react";
import { getMasterTemplate } from "@/lib/templates.functions";
import { MasterManualPreview } from "@/components/manual/MasterManualPreview";

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
  const uploadAsset = useServerFn(uploadManualAssetFile);
  const importPdf = useServerFn(importLegacyManualFromPdf);
  const fetchTemplates = useServerFn(listTemplates);

  const fetchMaster = useServerFn(getMasterTemplate);
  const masterQuery = useQuery({
    queryKey: ["master-template", orgId],
    queryFn: () => fetchMaster({ data: { organizationId: orgId } }),
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const workspaceQuery = useQuery({
    queryKey: ["product-workspace", productId],

    queryFn: () => fetchWorkspace({ data: { productId } }),
  });

  const templatesQuery = useQuery({
    queryKey: ["manual-templates", orgId],
    queryFn: () => fetchTemplates({ data: { organizationId: orgId } }),
  });

  const fetchTools = useServerFn(listTools);
  const createTool = useServerFn(upsertTool);
  const loadBom = useServerFn(loadBomForManual);
  const toolsQuery = useQuery({
    queryKey: ["tools", orgId],
    queryFn: () => fetchTools({ data: { organizationId: orgId } }),
  });
  const upsertToolMut = useMutation({
    mutationFn: (name: string) =>
      createTool({ data: { organizationId: orgId, name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tools", orgId] }),
    onError: (e: Error) => toast.error(e.message),
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
    mutationFn: (input: { manualId?: string; templateId?: string }) =>
      createDraft({ data: { productId, ...input } }),
    onSuccess: ({ versionId }) => {
      setActiveVersionId(versionId);
      qc.invalidateQueries({ queryKey: ["product-workspace", productId] });
      setCreateOpen(false);
      toast.success("Draft created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importMut = useMutation({
    mutationFn: (input: {
      filename: string;
      pdfBase64: string;
      templateId?: string;
    }) => importPdf({ data: { productId, ...input } }),
    onSuccess: ({ versionId }) => {
      setActiveVersionId(versionId);
      qc.invalidateQueries({ queryKey: ["product-workspace", productId] });
      setImportOpen(false);
      toast.success("Manual imported — review the draft");
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

  const uploadAssetMut = useMutation({
    mutationFn: async (input: { file: File; caption?: string }) => {
      const buf = await input.file.arrayBuffer();
      // Convert to base64 in chunks to avoid call-stack blowups on large files.
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(
          ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
        );
      }
      const dataBase64 = btoa(binary);
      return uploadAsset({
        data: {
          versionId: activeVersionId!,
          filename: input.file.name,
          contentType: input.file.type || "application/octet-stream",
          dataBase64,
          caption: input.caption,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-version", activeVersionId] });
      toast.success("Image uploaded");
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
          {primaryManual && (
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="mr-2 h-4 w-4" /> Preview
            </Button>
          )}
          {!primaryManual && (
            <>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Create manual
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Import from PDF
              </Button>
            </>
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

      <ManualPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        branding={masterQuery.data?.branding ?? {}}
        meta={{
          sku: ws.product.sku,
          name: ws.product.name,
          variant: ws.product.description ?? undefined,
          versionLabel: activeVersion ? String(activeVersion.version_number) : undefined,
        }}
        content={content}
      />


      <CreateManualDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        templates={templatesQuery.data ?? []}
        onSubmit={(templateId) => createMut.mutate({ templateId })}
        submitting={createMut.isPending}
      />
      <ImportPdfDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        templates={templatesQuery.data ?? []}
        onSubmit={(payload) => importMut.mutate(payload)}
        submitting={importMut.isPending}
      />


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
              onUploadAsset={(file, caption) =>
                uploadAssetMut.mutateAsync({ file, caption })
              }
              uploadingAsset={uploadAssetMut.isPending}
              tools={toolsQuery.data ?? []}
              onCreateTool={async (name) => {
                const created = await upsertToolMut.mutateAsync(name);
                return created;
              }}
              creatingTool={upsertToolMut.isPending}
              onLoadBom={async () => {
                const result = await loadBom({ data: { productId } });
                const hasExisting =
                  content.parts.length > 0 || content.hardware_kit.length > 0;
                if (
                  hasExisting &&
                  !confirm(
                    `Replace current Parts (${content.parts.length}) and Hardware Kit (${content.hardware_kit.length}) with ${result.parts.length} + ${result.hardware_kit.length} from the BOM?`,
                  )
                ) {
                  return;
                }
                setContent({
                  ...content,
                  parts: result.parts,
                  hardware_kit: result.hardware_kit,
                });
                if (result.hardwareBomMissing && result.hardwareSku) {
                  toast.warning(
                    `Hardware Kit BOM for ${result.hardwareSku} hasn't been synced yet.`,
                  );
                } else if (result.parts.length === 0 && result.hardware_kit.length === 0) {
                  toast.info("BOM is empty for this product.");
                } else {
                  toast.success(
                    `Loaded ${result.parts.length} parts${
                      result.hardware_kit.length
                        ? ` + ${result.hardware_kit.length} hardware`
                        : ""
                    }${result.excluded.length ? ` (${result.excluded.length} excluded)` : ""}`,
                  );
                }
              }}
              productSku={ws.product.sku}
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
  onUploadAsset,
  uploadingAsset,
  tools,
  onCreateTool,
  creatingTool,
  onLoadBom,
  productSku,
}: {
  content: ManualContent;
  setContent: (c: ManualContent) => void;
  editable: boolean;
  assets: { id: string; type: string; url: string | null; metadata: any }[];
  onAddAsset: (url: string, caption?: string) => void;
  onRemoveAsset: (id: string) => void;
  onUploadAsset: (file: File, caption?: string) => Promise<unknown>;
  uploadingAsset: boolean;
  tools: import("@/lib/tools.functions").ToolRow[];
  onCreateTool: (
    name: string,
  ) => Promise<{ id: string; name: string; spec: string | null }>;
  creatingTool: boolean;
  onLoadBom: () => Promise<void>;
  productSku: string;
}) {
  const [tab, setTab] = useState<
    "steps" | "tools" | "parts" | "warnings" | "torque" | "images"
  >("steps");

  // Build the figure source list from attached image assets, in display order.
  // Numbering reacts to add / remove / reorder via useFigureMap.
  const figureSources = useMemo(
    () =>
      assets
        .filter((a) => a.type === "image" || a.url)
        .map((a) => ({
          asset_id: a.id,
          caption: (a.metadata?.caption as string | undefined) ?? null,
          url: a.url ?? null,
        })),
    [assets],
  );
  const figMap = useFigureMap(figureSources);

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
            images={figureSources}
            figMap={figMap}
          />
        )}

        {tab === "tools" && (
          <ToolsListEditor
            items={content.tools}
            setItems={(items) => update("tools", items)}
            editable={editable}
            tools={tools}
            onCreateTool={onCreateTool}
            creating={creatingTool}
          />
        )}
        {tab === "parts" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Parts</h3>
                <p className="text-xs text-muted-foreground">
                  From the BOM of{" "}
                  <span className="font-mono">{productSku}</span>. Hardware
                  Kit comes from{" "}
                  <span className="font-mono">{productSku}.x</span>.
                </p>
              </div>
              {editable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onLoadBom().catch((e: Error) =>
                      toast.error(e.message),
                    );
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" /> Load from BOM
                </Button>
              )}
            </div>
            <PartsListEditor
              items={content.parts}
              setItems={(items) => update("parts", items)}
              editable={editable}
              emptyHint="No parts yet. Click 'Load from BOM' to autofill, or add manually."
              rowKeyPrefix="part"
            />

            <Separator />

            <div>
              <h3 className="text-sm font-semibold">Hardware Kit</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Sourced from{" "}
                <span className="font-mono">{productSku}.x</span> BOM lines.
              </p>
            </div>
            <PartsListEditor
              items={content.hardware_kit}
              setItems={(items) => update("hardware_kit", items)}
              editable={editable}
              emptyHint="No hardware kit lines. Load BOM or add manually."
              rowKeyPrefix="hw"
            />
          </div>
        )}
        {tab === "warnings" && (
          <WarningsEditor
            warnings={content.warnings}
            setWarnings={(w) => update("warnings", w)}
            editable={editable}
            images={figureSources}
            figMap={figMap}
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
            onUpload={onUploadAsset}
            uploading={uploadingAsset}
            figMap={figMap}
          />
        )}

      </CardContent>
    </Card>
  );
}


// Cheap HTML escape for migrating legacy plain-text step bodies into a text
// block on first edit. Newlines become paragraph breaks downstream when the
// editor reloads them.
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function StepsEditor({
  steps,
  setSteps,
  editable,
  images,
  figMap,
}: {
  steps: ManualContent["steps"];
  setSteps: (s: ManualContent["steps"]) => void;
  editable: boolean;
  images: { asset_id: string; caption?: string | null; url?: string | null }[];
  figMap: Map<string, number>;
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
          <StepBlocksEditor
            blocks={
              s.blocks ??
              // Migrate legacy plain-text body into a single text block on
              // first edit so the user can format/extend it immediately.
              (s.body
                ? [{ id: `${s.id}-legacy`, type: "text", html: `<p>${escapeHtml(s.body)}</p>` } as StepBlock]
                : [])
            }
            onChange={(blocks) => {
              const next = [...steps];
              // Drop legacy body once blocks exist.
              next[i] = { ...s, blocks, body: undefined };
              setSteps(next);
            }}
            disabled={!editable}
            images={images.map((img) => ({
              asset_id: img.asset_id,
              caption: img.caption ?? null,
              url: (img as { url?: string | null }).url ?? null,
            }))}
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
                blocks: [newStepBlock("text")!],
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
  images,
  figMap,
}: {
  warnings: ManualContent["warnings"];
  setWarnings: (w: ManualContent["warnings"]) => void;
  editable: boolean;
  images: { asset_id: string; caption?: string | null }[];
  figMap: Map<string, number>;
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
          <FigureRefField
            rows={2}
            value={w.body}
            disabled={!editable}
            className="flex-1"
            images={images}
            figMap={figMap}
            onChange={(v) => {
              const next = [...warnings];
              next[i] = { ...w, body: v };
              setWarnings(next);
            }}
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
  onUpload,
  uploading,
  figMap,
}: {
  assets: { id: string; type: string; url: string | null; metadata: any }[];
  editable: boolean;
  onAdd: (url: string, caption?: string) => void;
  onRemove: (id: string) => void;
  onUpload: (file: File, caption?: string) => Promise<unknown>;
  uploading: boolean;
  figMap: Map<string, number>;
}) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="space-y-3">
      {assets.length === 0 && (
        <p className="text-xs text-muted-foreground">No images attached.</p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {assets.map((a) => {
          const figNum = figMap.get(a.id);
          return (
            <figure key={a.id} className="rounded-md border border-border p-2">
              {a.url && (
                <img
                  src={a.url}
                  alt={a.metadata?.caption ?? ""}
                  className="aspect-video w-full rounded object-cover"
                />
              )}
              <figcaption className="mt-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-foreground">
                  {figNum ? `Fig. ${figNum}` : "—"}
                </span>
                <span className="truncate text-muted-foreground">
                  {a.metadata?.caption ?? a.url}
                </span>
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
          );
        })}
      </div>

      {editable && (
        <div className="space-y-3 rounded-md border border-dashed border-border p-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Upload image file
            </p>
            <Input
              placeholder="Caption (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="h-8 max-w-md text-sm"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  await onUpload(f, caption.trim() || undefined);
                  setCaption("");
                } finally {
                  if (fileRef.current) fileRef.current.value = "";
                }
              }}
            />
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Plus className="mr-2 h-4 w-4" />
              {uploading ? "Uploading…" : "Choose image"}
            </Button>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground">
              …or paste an image URL
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="https://image-url.jpg"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-8 max-w-sm text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!url.trim()) return;
                  onAdd(url.trim(), caption.trim() || undefined);
                  setUrl("");
                  setCaption("");
                }}
              >
                Add by URL
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Create / Import dialogs ----------

type TemplateOption = {
  id: string;
  name: string;
  layout: string;
  is_default: boolean;
};

function TemplatePicker({
  templates,
  value,
  onChange,
}: {
  templates: TemplateOption[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const hasDefault = templates.some((t) => t.is_default);
  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? undefined : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder="Pick a template" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">
          None — blank{!hasDefault ? " · default" : ""}
        </SelectItem>
        {templates.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
            {t.is_default ? " · default" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CreateManualDialog({
  open,
  onOpenChange,
  templates,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templates: TemplateOption[];
  onSubmit: (templateId: string | undefined) => void;
  submitting: boolean;
}) {
  const defaultId = templates.find((t) => t.is_default)?.id;
  const [templateId, setTemplateId] = useState<string | undefined>(defaultId);
  useEffect(() => {
    if (open) setTemplateId(defaultId);
  }, [open, defaultId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create manual</DialogTitle>
          <DialogDescription>
            Pick a template to pre-fill sections, or start blank.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Template</Label>
          <TemplatePicker
            templates={templates}
            value={templateId}
            onChange={setTemplateId}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit(templateId)}
            disabled={submitting}
          >
            <Plus className="mr-2 h-4 w-4" />
            {submitting ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportPdfDialog({
  open,
  onOpenChange,
  templates,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templates: TemplateOption[];
  onSubmit: (input: {
    filename: string;
    pdfBase64: string;
    templateId?: string;
  }) => void;
  submitting: boolean;
}) {
  const defaultId = templates.find((t) => t.is_default)?.id;
  const [templateId, setTemplateId] = useState<string | undefined>(defaultId);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setTemplateId(defaultId);
      setFile(null);
    }
  }, [open, defaultId]);

  const handleSubmit = async () => {
    if (!file) {
      toast.error("Pick a PDF file");
      return;
    }
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("PDF too large (max 20 MB)");
      return;
    }
    // base64 encode in-browser
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(
        ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
      );
    }
    const pdfBase64 = btoa(binary);
    onSubmit({ filename: file.name, pdfBase64, templateId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import legacy manual from PDF</DialogTitle>
          <DialogDescription>
            We'll upload the PDF, extract the steps / parts / warnings with
            AI, and create a new draft for you to clean up.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>PDF file (max 20 MB)</Label>
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Template</Label>
            <TemplatePicker
              templates={templates}
              value={templateId}
              onChange={setTemplateId}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !file}>
            <Upload className="mr-2 h-4 w-4" />
            {submitting ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function ManualPreviewDialog({
  open,
  onOpenChange,
  branding,
  meta,
  content,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branding: unknown;
  meta: { sku: string; name: string; variant?: string; versionLabel?: string };
  content: ManualContent;
}) {
  const handlePrint = () => {
    const node = document.getElementById("manual-print-area");
    if (!node) return;
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${meta.sku} — ${meta.name}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@500;600;700;800&family=Bebas+Neue&family=Inter:wght@400;600;700&family=Oswald:wght@400;600;700&family=Roboto:wght@400;500;700&family=Roboto+Condensed:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap">
      <style>body{margin:0;background:white}@page{size:letter;margin:0}</style>
    </head><body>${node.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 flex-row items-center justify-between space-y-0">
          <DialogTitle>Manual preview</DialogTitle>
          <Button size="sm" onClick={handlePrint} className="mr-8">
            <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
          </Button>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 bg-muted/30 py-4" id="manual-print-area">
          <MasterManualPreview branding={branding} meta={meta} content={content} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
