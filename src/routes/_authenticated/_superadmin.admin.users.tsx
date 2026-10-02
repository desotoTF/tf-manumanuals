import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminGrantSuperAdmin,
  adminListUsers,
  adminRevokeSuperAdmin,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_superadmin/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const fetchUsers = useServerFn(adminListUsers);
  const grant = useServerFn(adminGrantSuperAdmin);
  const revoke = useServerFn(adminRevokeSuperAdmin);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const usersQuery = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: () => fetchUsers({ data: { search } }),
  });

  const grantMut = useMutation({
    mutationFn: (userId: string) => grant({ data: { userId } }),
    onSuccess: () => {
      toast.success("Super admin granted");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revokeMut = useMutation({
    mutationFn: (userId: string) => revoke({ data: { userId } }),
    onSuccess: () => {
      toast.success("Super admin revoked");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Every user with a profile. Grant or revoke the platform super_admin
          role. (Org-level role changes happen on the org detail page.)
        </p>
      </header>

      <Input
        placeholder="Search by email or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Organizations</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {usersQuery.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
            {usersQuery.data?.map((u) => {
              const isSuper = u.platform_roles.includes("super_admin");
              return (
                <TableRow key={u.id}>
                  <TableCell>{u.email ?? "—"}</TableCell>
                  <TableCell>{u.full_name ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.organizations.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {u.organizations.map((o) => (
                        <Badge key={o.id} variant="outline" className="text-xs">
                          {o.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isSuper ? (
                      <Badge className="bg-primary/15 text-primary">super_admin</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isSuper ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Revoke super_admin from ${u.email ?? u.id}?`,
                            )
                          )
                            revokeMut.mutate(u.id);
                        }}
                      >
                        Revoke
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => grantMut.mutate(u.id)}
                      >
                        Grant super_admin
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
