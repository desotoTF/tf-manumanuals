import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminCreateOrganization,
  adminListOrganizations,
} from "@/lib/admin.functions";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/_superadmin/admin/orgs")({
  component: AdminOrgsPage,
});

function AdminOrgsPage() {
  const fetchOrgs = useServerFn(adminListOrganizations);
  const createOrg = useServerFn(adminCreateOrganization);
  const qc = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: ["admin", "orgs"],
    queryFn: () => fetchOrgs(),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createOrg({
        data: {
          name,
          slug,
          initialOwnerEmail: ownerEmail || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Organization created");
      setOpen(false);
      setName("");
      setSlug("");
      setOwnerEmail("");
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Organizations
          </h1>
          <p className="text-sm text-muted-foreground">
            Every tenant on the platform. Click a row to manage members and
            connections.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>New organization</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create organization</DialogTitle>
              <DialogDescription>
                Optionally seed an initial owner — they'll be added as
                owner+admin. If the user doesn't exist yet, an auth user is
                created (no password); invite them via Team settings to set a
                password.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Manufacturing"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="acme-mfg"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Initial owner email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="founder@acme.com"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMut.mutate()}
                disabled={!name || !slug || createMut.isPending}
              >
                {createMut.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>ERP connections</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgsQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {orgsQuery.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No organizations yet.
                </TableCell>
              </TableRow>
            )}
            {orgsQuery.data?.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link
                    to="/admin/orgs/$orgId"
                    params={{ orgId: o.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {o.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {o.slug}
                </TableCell>
                <TableCell>{o.member_count}</TableCell>
                <TableCell>{o.connection_count}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
