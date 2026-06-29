// Manual templates admin page.
// Owners/admins manage reusable manual skeletons that authors pick from when
// starting (or importing) a manual. Members read-only.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useActiveOrg } from "@/components/AppShell";
import {
  clearDefaultTemplate,
  deleteTemplate,
  listTemplates,
  setDefaultTemplate,
  upsertTemplate,
  type TemplateRow,
} from "@/lib/templates.functions";
import { emptyManualContent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Star, Trash2, Pencil, Palette } from "lucide-react";
import { EditBrandingDialog } from "@/components/templates/EditBrandingDialog";


export const Route = createFileRoute("/_authenticated/settings/templates")({
  component: TemplatesPage,
});

const LAYOUT_LABELS: Record<string, string> = {
  classic: "Classic — full sections, photos inline",
  compact: "Compact — dense parts/steps, minimal chrome",
  field_guide: "Field guide — large type, warning-first",
  service_card: "Service card — single-page quick reference",
};

function TemplatesPage() {
  const { orgId, isAdmin } = useActiveOrg();
  const qc = useQueryClient();
  const fetchList = useServerFn(listTemplates);
  const upsert = useServerFn(upsertTemplate);
  const del = useServerFn(deleteTemplate);
  const setDefault = useServerFn(setDefaultTemplate);
  const clearDefault = useServerFn(clearDefaultTemplate);

  const tplQuery = useQuery({
    queryKey: ["manual-templates", orgId],
    queryFn: () => fetchList({ data: { organizationId: orgId } }),
  });

  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const upsertMut = useMutation({
    mutationFn: (input: {
      id?: string;
      organizationId: string;
      name: string;
      description: string | null;
      layout: "classic" | "compact" | "field_guide" | "service_card";
      defaultContent?: Record<string, unknown>;
      isDefault?: boolean;
    }) => upsert({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-templates", orgId] });
      setDialogOpen(false);
      setEditing(null);
      toast.success("Template saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-templates", orgId] });
      toast.success("Template deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDefaultMut = useMutation({
    mutationFn: (id: string) =>
      setDefault({ data: { id, organizationId: orgId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-templates", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearDefaultMut = useMutation({
    mutationFn: () => clearDefault({ data: { organizationId: orgId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-templates", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (t: TemplateRow) => {
    setEditing(t);
    setDialogOpen(true);
  };

  const [brandingTpl, setBrandingTpl] = useState<TemplateRow | null>(null);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const openBranding = (t: TemplateRow) => {
    setBrandingTpl(t);
    setBrandingOpen(true);
  };

  const noneIsDefault = !tplQuery.data?.some((t) => t.is_default);


  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Manual templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Reusable skeletons authors pick from when starting or importing a
            manual. Pick the layout to control how the public page renders.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New template
          </Button>
        )}
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {tplQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {!tplQuery.isLoading && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                None
                {noneIsDefault && (
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    <Star className="mr-1 h-3 w-3" /> Default
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Blank manual with no pre-filled template content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Built in and locked. Use this when new manuals should start blank.
              </p>
              {isAdmin && !noneIsDefault && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clearDefaultMut.mutate()}
                  disabled={clearDefaultMut.isPending}
                >
                  <Star className="mr-1.5 h-3.5 w-3.5" /> Make default
                </Button>
              )}
            </CardContent>
          </Card>
        )}
        {tplQuery.data?.map((t) => (
          <Card key={t.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {t.name}
                {t.is_master && (
                  <Badge variant="secondary" className="bg-rose-500/15 text-rose-700 dark:text-rose-400">
                    <Palette className="mr-1 h-3 w-3" /> Master
                  </Badge>
                )}
                {t.is_default && (
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    <Star className="mr-1 h-3 w-3" /> Default
                  </Badge>
                )}
              </CardTitle>

              <CardDescription className="text-xs">
                {LAYOUT_LABELS[t.layout] ?? t.layout}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {t.description && (
                <p className="text-muted-foreground">{t.description}</p>
              )}
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                  {t.is_master && (
                    <Button size="sm" variant="outline" onClick={() => openBranding(t)}>
                      <Palette className="mr-1.5 h-3.5 w-3.5" /> Edit branding
                    </Button>
                  )}
                  {!t.is_default && (

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDefaultMut.mutate(t.id)}
                      disabled={setDefaultMut.isPending}
                    >
                      <Star className="mr-1.5 h-3.5 w-3.5" /> Make default
                    </Button>
                  )}
                  {!t.is_master && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete template "${t.name}"?`))
                          delMut.mutate(t.id);
                      }}
                      disabled={delMut.isPending}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                    </Button>
                  )}

                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <TemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSubmit={(payload) =>
          upsertMut.mutate({ ...payload, organizationId: orgId })
        }
        submitting={upsertMut.isPending}
      />

      <EditBrandingDialog
        open={brandingOpen}
        onOpenChange={setBrandingOpen}
        template={brandingTpl}
      />
    </div>
  );
}


function TemplateDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: TemplateRow | null;
  onSubmit: (payload: {
    id?: string;
    name: string;
    description: string | null;
    layout: "classic" | "compact" | "field_guide" | "service_card";
    defaultContent?: Record<string, unknown>;
    isDefault?: boolean;
  }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [layout, setLayout] = useState<TemplateRow["layout"]>(
    editing?.layout ?? "classic",
  );
  const [isDefault, setIsDefault] = useState(editing?.is_default ?? false);
  const [skeletonJson, setSkeletonJson] = useState(
    JSON.stringify(editing?.default_content ?? emptyManualContent(), null, 2),
  );

  // Reset when editing target changes
  useState(() => {
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setLayout(editing?.layout ?? "classic");
    setIsDefault(editing?.is_default ?? false);
    setSkeletonJson(
      JSON.stringify(editing?.default_content ?? emptyManualContent(), null, 2),
    );
  });

  const handleSave = () => {
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(skeletonJson);
    } catch {
      toast.error("Default content must be valid JSON");
      return;
    }
    onSubmit({
      id: editing?.id,
      name: name.trim(),
      description: description.trim() || null,
      layout,
      defaultContent: parsed,
      isDefault,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) {
          setName(editing?.name ?? "");
          setDescription(editing?.description ?? "");
          setLayout(editing?.layout ?? "classic");
          setIsDefault(editing?.is_default ?? false);
          setSkeletonJson(
            JSON.stringify(
              editing?.default_content ?? emptyManualContent(),
              null,
              2,
            ),
          );
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit template" : "New manual template"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard installation"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When to use this template"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Layout</Label>
              <Select
                value={layout}
                onValueChange={(v) => setLayout(v as TemplateRow["layout"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LAYOUT_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                Make this the default template
              </label>
            </div>
          </div>
          <div>
            <Label>Default content (JSON)</Label>
            <Textarea
              rows={10}
              className="font-mono text-xs"
              value={skeletonJson}
              onChange={(e) => setSkeletonJson(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Pre-fills tools, parts, steps, warnings, torque_specs, and
              images sections for every new manual using this template.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting || !name.trim()}>
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
