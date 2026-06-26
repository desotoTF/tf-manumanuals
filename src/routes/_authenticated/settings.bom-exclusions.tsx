// BOM exclusions admin page — owners/admins manage the list of part-number
// patterns that get dropped from the manual editor's BOM autofill.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useActiveOrg } from "@/components/AppShell";
import {
  addExclusion,
  listExclusions,
  removeExclusion,
} from "@/lib/bom-exclusions.functions";
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
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/bom-exclusions")({
  component: BomExclusionsPage,
});

type MatchType = "exact" | "prefix" | "suffix" | "contains";

function BomExclusionsPage() {
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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">BOM exclusions</h1>
        <p className="text-sm text-muted-foreground">
          Part-number patterns to drop from the manual editor's BOM autofill.
          Seeded defaults cover packaging and instruction-sheet line items.
        </p>
      </header>

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
