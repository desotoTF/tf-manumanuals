import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useActiveOrg } from "@/components/AppShell";
import { getOrgMembers } from "@/lib/auth.functions";
import {
  createInvitation,
  listInvitations,
} from "@/lib/invitations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/team")({
  component: TeamPage,
});

function TeamPage() {
  const { orgId, isAdmin } = useActiveOrg();
  const qc = useQueryClient();
  const fetchMembers = useServerFn(getOrgMembers);
  const fetchInvites = useServerFn(listInvitations);
  const invite = useServerFn(createInvitation);

  const membersQuery = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => fetchMembers({ data: { organizationId: orgId } }),
  });
  const invitesQuery = useQuery({
    queryKey: ["invites", orgId],
    queryFn: () => fetchInvites({ data: { organizationId: orgId } }),
    enabled: isAdmin,
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [lastLink, setLastLink] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () =>
      invite({ data: { organizationId: orgId, email, role } }),
    onSuccess: (res) => {
      const link = `${window.location.origin}/auth?invite_token=${res.token}`;
      setLastLink(link);
      setEmail("");
      toast.success("Invitation created");
      qc.invalidateQueries({ queryKey: ["invites", orgId] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to invite"),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          Members of your organization. Onboarding is invite-only.
        </p>
      </header>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>
              Generate an invite link and share it directly. Email delivery comes
              in a later phase.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="grid grid-cols-1 gap-3 md:grid-cols-[1fr,160px,auto]"
              onSubmit={(e) => {
                e.preventDefault();
                inviteMutation.mutate();
              }}
            >
              <div>
                <Label htmlFor="email" className="sr-only">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? "Creating…" : "Create invite"}
              </Button>
            </form>
            {lastLink && (
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Invite link (shown once — share now):
                </p>
                <code className="mt-1 block break-all text-xs">{lastLink}</code>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {membersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ul className="divide-y divide-border">
              {membersQuery.data?.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {m.profile?.full_name ?? m.profile?.email ?? m.user_id}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.profile?.email}</p>
                  </div>
                  <div className="flex gap-1">
                    {m.roles.map((r) => (
                      <Badge key={r} variant="outline">{r}</Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            {invitesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : invitesQuery.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invitations.</p>
            ) : (
              <ul className="divide-y divide-border">
                {invitesQuery.data?.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Role: {inv.role} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={inv.accepted_at ? "secondary" : "outline"}>
                      {inv.accepted_at ? "Accepted" : "Pending"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
