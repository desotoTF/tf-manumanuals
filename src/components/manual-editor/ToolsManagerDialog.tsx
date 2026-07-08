// Org-scoped tools library manager. Opened from a gear icon in the editor.
// Lets admins rename an existing tool (which auto-rewrites the tool name in
// every manual version that references it), add a new tool inline, and
// delete tools that are not referenced anywhere.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";
import {
  listTools,
  renameTool,
  deleteTool,
  upsertTool,
  countToolUsage,
} from "@/lib/tools.functions";
import type { Tool } from "@/lib/types";

export function ToolsManagerDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
}) {
  const qc = useQueryClient();
  const fetchTools = useServerFn(listTools);
  const rename = useServerFn(renameTool);
  const del = useServerFn(deleteTool);
  const create = useServerFn(upsertTool);
  const countUsage = useServerFn(countToolUsage);

  const toolsQuery = useQuery({
    queryKey: ["tools", organizationId],
    queryFn: () => fetchTools({ data: { organizationId } }),
    enabled: open,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftSpec, setDraftSpec] = useState("");
  const [newName, setNewName] = useState("");
  const [newSpec, setNewSpec] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tools", organizationId] });
  };

  const renameMut = useMutation({
    mutationFn: (row: Tool) =>
      rename({
        data: {
          id: row.id,
          organizationId,
          name: draftName.trim(),
          spec: draftSpec.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Tool renamed");
      setEditingId(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: async (row: Tool) => {
      const usage = await countUsage({
        data: { id: row.id, organizationId },
      });
      if (usage.count > 0) {
        throw new Error(
          `"${row.name}" is used in ${usage.count} manual version${usage.count === 1 ? "" : "s"}. Remove it from those manuals first.`,
        );
      }
      if (
        !confirm(
          `Delete "${row.name}"? This permanently removes it from the tools library.`,
        )
      ) {
        throw new Error("cancelled");
      }
      return del({ data: { id: row.id, organizationId } });
    },
    onSuccess: () => {
      toast.success("Tool deleted");
      invalidate();
    },
    onError: (e) => {
      const msg = (e as Error).message;
      if (msg !== "cancelled") toast.error(msg);
    },
  });

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          organizationId,
          name: newName.trim(),
          spec: newSpec.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Tool added");
      setNewName("");
      setNewSpec("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = toolsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage tools library</DialogTitle>
          <DialogDescription>
            Rename or remove reusable tools. Renaming updates every manual version
            that references the tool. A tool can only be deleted when no manual
            references it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {toolsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {!toolsQuery.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tools yet. Add one below.
            </p>
          )}
          {rows.map((row) => {
            const isEditing = editingId === row.id;
            return (
              <div
                key={row.id}
                className="flex items-center gap-2 rounded-md border border-border p-2"
              >
                {isEditing ? (
                  <>
                    <Input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Tool name"
                      className="h-8 flex-1 text-sm"
                    />
                    <Input
                      value={draftSpec}
                      onChange={(e) => setDraftSpec(e.target.value)}
                      placeholder="Spec (optional)"
                      className="h-8 flex-1 text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => renameMut.mutate(row)}
                      disabled={renameMut.isPending || !draftName.trim()}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 text-sm font-medium">{row.name}</div>
                    <div className="flex-1 truncate text-xs text-muted-foreground">
                      {row.spec ?? ""}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(row.id);
                        setDraftName(row.name);
                        setDraftSpec(row.spec ?? "");
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteMut.mutate(row)}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-2 space-y-2 rounded-md border border-dashed border-border p-3">
          <Label className="text-xs font-semibold uppercase text-muted-foreground">
            Add a new tool
          </Label>
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tool name"
              className="h-8 flex-1 text-sm"
            />
            <Input
              value={newSpec}
              onChange={(e) => setNewSpec(e.target.value)}
              placeholder="Spec (optional)"
              className="h-8 flex-1 text-sm"
            />
            <Button
              size="sm"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !newName.trim()}
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
