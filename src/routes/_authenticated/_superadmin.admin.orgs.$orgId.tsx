import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminAddMember,
  adminDeleteOrganization,
  adminGetOrganization,
  adminRemoveMember,
  adminSetMemberRoles,
  adminUpdateOrganization,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const ROLES = ["owner", "admin", "editor", "viewer"] as const;
type Role = (typeof ROLES)[number];

export const Route = createFileRoute(
  "/_authenticated/_superadmin/admin/orgs/$orgId",
)({
  component: AdminOrgDetailPage,
});

function AdminOrgDetailPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();
  const fetchOrg = useServerFn(adminGetOrganization);
  const updateOrg = useServerFn(adminUpdateOrganization);
  const deleteOrg = useServerFn(adminDeleteOrganization);
  const addMember = useServerFn(adminAddMember);
  const setRoles = useServerFn(adminSetMemberRoles);
  const removeMember = useServerFn(adminRemoveMember);

  const orgQuery = useQuery({
    queryKey: ["admin", "org", orgId],
    queryFn: () => fetchOrg({ data: { organizationId: orgId } }),
  });

  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<Role>("editor");

  const renameMut = useMutation({
    mutationFn: () =>
      updateOrg({
        data: {
          organizationId: orgId,
          name: newName || undefined,
          slug: newSlug || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Updated");
      setRenameOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "org", orgId] });
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteOrg({ data: { organizationId: orgId } }),
    onSuccess: () => {
      toast.success("Organization deleted");
      window.location.assign("/admin/orgs");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: () =>
      addMember({
        data: { organizationId: orgId, email: addEmail, roles: [addRole] },
      }),
    onSuccess: () => {
      toast.success("Member added");
      setAddEmail("");
      qc.invalidateQueries({ queryKey: ["admin", "org", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rolesMut = useMutation({
    mutationFn: (v: { userId: string; roles: Role[] }) =>
      setRoles({ data: { organizationId: orgId, ...v } }),
    onSuccess: () => {
      toast.success("Roles updated");
      qc.invalidateQueries({ queryKey: ["admin", "org", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) =>
      removeMember({ data: { organizationId: orgId, userId } }),
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["admin", "org", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (orgQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!orgQuery.data) return <p className="text-sm text-muted-foreground">Not found.</p>;

  const { organization, members, invitations, connections } = orgQuery.data;

  return (
    <div className="space-y-6">
      <Link
        to="/admin/orgs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All organizations
      </Link>

      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{organization.name}</h1>
          <p className="font-mono text-xs text-muted-foreground">{organization.slug}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setNewName(organization.name);
              setNewSlug(organization.slug);
              setRenameOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (
                window.confirm(
                  `Delete ${organization.name}? This cascades to members, products, manuals, and ERP connections. This cannot be undone.`,
                )
              )
                deleteMut.mutate();
            }}
            disabled={deleteMut.isPending}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        </div>
      </header>

      {renameOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit organization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Slug</Label>
              <Input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => renameMut.mutate()} disabled={renameMut.isPending}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-1 min-w-[200px]">
              <Label htmlFor="add-email">Add by email</Label>
              <Input
                id="add-email"
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={addRole} onValueChange={(v) => setAddRole(v as Role)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => addMut.mutate()} disabled={!addEmail || addMut.isPending}>
              Add member
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    No members.
                  </TableCell>
                </TableRow>
              )}
              {members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell>{m.profile?.email ?? "—"}</TableCell>
                  <TableCell>{m.profile?.full_name ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {ROLES.map((r) => {
                        const active = m.roles.includes(r);
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              const next = active
                                ? m.roles.filter((x) => x !== r)
                                : [...m.roles, r];
                              rolesMut.mutate({
                                userId: m.user_id,
                                roles: next as Role[],
                              });
                            }}
                            className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted/70"
                            }`}
                          >
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Remove ${m.profile?.email}?`))
                          removeMut.mutate(m.user_id);
                      }}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>{i.role}</TableCell>
                    <TableCell>
                      {i.accepted_at ? (
                        <Badge variant="secondary">Accepted</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(i.expires_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ERP connections</CardTitle>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Last sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.provider}</TableCell>
                    <TableCell className="font-mono text-xs">{c.base_url}</TableCell>
                    <TableCell>
                      {c.is_active ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.last_sync_at
                        ? formatDistanceToNow(new Date(c.last_sync_at), { addSuffix: true })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
