// BOM settings admin page — two tabs:
//   1. Part exclusions  — SKU-pattern list dropped from BOM autofill.
//   2. Part catalog     — per-org SKU → alias + image overrides used by the
//      manual editor and the PDF renderer.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useActiveOrg } from "@/components/AppShell";
import {
  addExclusion,
  listExclusions,
  removeExclusion,
} from "@/lib/bom-exclusions.functions";
import { usePartCatalog } from "@/lib/use-part-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImagePlus, Plus, RotateCcw, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/bom-exclusions")({
  component: BomSettingsPage,
});

function BomSettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">BOM settings</h1>
        <p className="text-sm text-muted-foreground">
          Control how BOM lines from Odoo are filtered and displayed in your
          manuals.
        </p>
      </header>

      <Tabs defaultValue="exclusions">
        <TabsList>
          <TabsTrigger value="exclusions">Part exclusions</TabsTrigger>
          <TabsTrigger value="catalog">Part catalog</TabsTrigger>
        </TabsList>
        <TabsContent value="exclusions" className="pt-4">
          <PartExclusionsPanel />
        </TabsContent>
        <TabsContent value="catalog" className="pt-4">
          <PartCatalogPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type MatchType = "exact" | "prefix" | "suffix" | "contains";

function PartExclusionsPanel() {
  const { orgId, isAdmin } = useActiveOrg();
  const qc = useQueryClient();
  const fetchList = useServerFn(listExclusions);
  const add = useServerFn(addExclusion);
  const remove = useServerFn(removeExclusion);

  const listQuery = useQuery({
    queryKey: ["bom-exclusions", orgId],
    queryFn: () => fetchList({ data: { organizationId: orgId } }),
  });

  const [pattern, setPattern] = useState("");
  const [matchType, setMatchType] = useState<MatchType>("exact");
  const [note, setNote] = useState("");

  const addMut = useMutation({
    mutationFn: () =>
      add({
        data: {
          organizationId: orgId,
          pattern: pattern.trim(),
          match_type: matchType,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bom-exclusions", orgId] });
      setPattern("");
      setNote("");
      setMatchType("exact");
      toast.success("Exclusion added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bom-exclusions", orgId] });
      toast.success("Exclusion removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Part exclusions</h2>
        <p className="text-xs text-muted-foreground">
          SKU patterns dropped from the manual editor's BOM autofill. Seeded
          defaults cover packaging and instruction-sheet line items.
        </p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Add exclusion</CardTitle>
            <CardDescription className="text-xs">
              Use <span className="font-mono">exact</span> for a specific SKU,
              or a partial match for whole families.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-[1fr_140px_1fr_auto]">
              <div>
                <Label className="text-xs">Pattern</Label>
                <Input
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="TF000001-01"
                />
              </div>
              <div>
                <Label className="text-xs">Match</Label>
                <Select
                  value={matchType}
                  onValueChange={(v) => setMatchType(v as MatchType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exact">Exact</SelectItem>
                    <SelectItem value="prefix">Prefix</SelectItem>
                    <SelectItem value="suffix">Suffix</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Note (optional)</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why this is excluded"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => addMut.mutate()}
                  disabled={!pattern.trim() || addMut.isPending}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pattern</TableHead>
                <TableHead className="w-28">Match</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-24"></TableHead>
                {isAdmin && <TableHead className="w-16"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {listQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No exclusions yet.
                  </TableCell>
                </TableRow>
              )}
              {listQuery.data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.pattern}</TableCell>
                  <TableCell className="text-sm capitalize">
                    {r.match_type}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.note ?? "—"}
                  </TableCell>
                  <TableCell>
                    {r.is_seed && (
                      <Badge variant="secondary" className="text-xs">
                        Seed
                      </Badge>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remove exclusion "${r.pattern}"?`))
                            removeMut.mutate(r.id);
                        }}
                        className="text-destructive hover:text-destructive"
                        aria-label="Remove exclusion"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PartCatalogPanel() {
  const { orgId, isAdmin } = useActiveOrg();
  const { query, controls, deleteEntry } = usePartCatalog(orgId, isAdmin);
  const [search, setSearch] = useState("");

  const rows = (query.data ?? []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.sku.toLowerCase().includes(q) ||
      (r.alias ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Part catalog</h2>
          <p className="text-xs text-muted-foreground">
            Per-SKU friendly names and thumbnail images that override the raw
            Odoo description in every manual for this organization. Admins can
            edit entries here or inline in the Parts tab of any manual.
          </p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by SKU or alias"
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16"></TableHead>
                <TableHead className="w-48">SKU</TableHead>
                <TableHead>Alias</TableHead>
                {isAdmin && <TableHead className="w-16"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!query.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    {search
                      ? "No matches."
                      : "No catalog entries yet. Add aliases and images from the Parts tab of any manual."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <CatalogRow
                  key={r.id}
                  id={r.id}
                  sku={r.sku}
                  alias={r.alias}
                  imageUrl={r.image_url}
                  isAdmin={isAdmin}
                  onAliasChange={(alias) =>
                    controls.onAliasChange(r.sku, alias)
                  }
                  onImageUpload={(file) =>
                    controls.onImageUpload(r.sku, file)
                  }
                  onImageClear={() => controls.onImageClear(r.id)}
                  onDelete={() => {
                    if (confirm(`Remove catalog entry for "${r.sku}"?`))
                      deleteEntry(r.id);
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CatalogRow({
  id,
  sku,
  alias,
  imageUrl,
  isAdmin,
  onAliasChange,
  onImageUpload,
  onImageClear,
  onDelete,
}: {
  id: string;
  sku: string;
  alias: string | null;
  imageUrl: string | null;
  isAdmin: boolean;
  onAliasChange: (alias: string | null) => void;
  onImageUpload: (file: File) => void;
  onImageClear: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(alias ?? "");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const commit = () => {
    const t = draft.trim();
    const next = t === "" ? null : t;
    if (next === alias) return;
    onAliasChange(next);
  };

  return (
    <TableRow key={id}>
      <TableCell>
        {imageUrl ? (
          <div className="group relative h-10 w-10 overflow-hidden rounded border bg-muted">
            <img src={imageUrl} alt={sku} className="h-full w-full object-cover" />
            {isAdmin && (
              <button
                type="button"
                onClick={onImageClear}
                aria-label="Remove image"
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3 text-white" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => fileRef.current?.click()}
            className="flex h-10 w-10 items-center justify-center rounded border border-dashed text-muted-foreground hover:bg-muted disabled:opacity-40"
            aria-label="Add image"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImageUpload(f);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
      </TableCell>
      <TableCell className="font-mono text-sm">{sku}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            disabled={!isAdmin}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Friendly display name"
            className="h-8 text-sm"
          />
          {isAdmin && alias && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft("");
                onAliasChange(null);
              }}
              className="h-8 w-8 p-0"
              aria-label="Clear alias"
              title="Clear alias"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TableCell>
      {isAdmin && (
        <TableCell>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
            aria-label="Delete entry"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
