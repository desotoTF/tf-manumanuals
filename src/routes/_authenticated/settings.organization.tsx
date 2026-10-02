// Organization profile: display name + public URL handle used for branded
// public manual links (manumanuals.com/m/<handle>/<manual>).
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Link2, Copy } from "lucide-react";
import { useActiveOrg } from "@/components/AppShell";
import { getOrgProfile, updateOrgProfile, normalizeOrgSlug } from "@/lib/org-settings.functions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings/organization")({
  component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
  const { orgId, isAdmin } = useActiveOrg();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getOrgProfile);
  const save = useServerFn(updateOrgProfile);

  const profile = useQuery({
    queryKey: ["org-profile", orgId],
    queryFn: () => fetchProfile({ data: { organizationId: orgId } }),
    enabled: !!orgId,
  });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name ?? "");
      setSlug(profile.data.slug ?? "");
    }
  }, [profile.data]);

  const preview = normalizeOrgSlug(slug || "your-company");

  const saveMut = useMutation({
    mutationFn: () => save({ data: { organizationId: orgId, name, slug } }),
    onSuccess: () => {
      toast.success("Organization settings saved");
      qc.invalidateQueries({ queryKey: ["org-profile", orgId] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const baseUrl = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Organization</h1>
        <p className="text-sm text-muted-foreground">
          Your company name and the web address your published manuals live under.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>
            Shown on your public manual pages and used to build shareable links.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {profile.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="org-name">Company name</Label>
                <Input
                  id="org-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-slug">Public web address</Label>
                <Input
                  id="org-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="your-company"
                  disabled={!isAdmin}
                />
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5" />
                  <span className="font-mono">
                    {baseUrl}/m/{preview}/your-manual
                  </span>
                  <button
                    type="button"
                    className="ml-1 inline-flex items-center gap-1 text-primary hover:underline"
                    onClick={() => {
                      navigator.clipboard.writeText(`${baseUrl}/m/${preview}`);
                      toast.success("Link copied");
                    }}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers and dashes only. Changing this changes every
                  published link you have already shared.
                </p>
              </div>

              {!isAdmin && (
                <p className="text-xs text-muted-foreground">
                  Only owners and admins can change these settings.
                </p>
              )}

              <Button
                onClick={() => saveMut.mutate()}
                disabled={!isAdmin || saveMut.isPending || !name.trim() || preview.length < 2}
              >
                {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
