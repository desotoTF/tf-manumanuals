import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMyOrgs } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogOut } from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { createContext, useContext } from "react";

const ACTIVE_ORG_KEY = "mm.activeOrgId";

export function useActiveOrgId() {
  const [orgId, setOrgId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(ACTIVE_ORG_KEY);
    return v && v !== "null" && v !== "undefined" ? v : null;
  });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_ORG_KEY) setOrgId(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return {
    orgId,
    setOrgId: useCallback((id: string) => {
      localStorage.setItem(ACTIVE_ORG_KEY, id);
      setOrgId(id);
    }, []),
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const router = useRouter();
  const fetchOrgs = useServerFn(listMyOrgs);
  const { orgId, setOrgId } = useActiveOrgId();

  const orgsQuery = useQuery({
    queryKey: ["my-orgs"],
    queryFn: () => fetchOrgs(),
  });

  const orgs = orgsQuery.data?.orgs ?? [];
  const isSuperAdmin = !!orgsQuery.data?.isSuperAdmin;

  useEffect(() => {
    if (orgs.length === 0) return;
    if (!orgId || !orgs.some((org) => org.id === orgId)) {
      setOrgId(orgs[0].id);
    }
  }, [orgId, orgs, setOrgId]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth" });
  };

  const activeOrg = orgs.find((o) => o.id === orgId);
  const isAdmin =
    activeOrg?.roles.includes("owner") || activeOrg?.roles.includes("admin");

  // For super admins with no org membership, still show the shell so they can
  // reach /admin/* routes.
  const hasShellAccess = orgs.length > 0 || isSuperAdmin;
  const waitingForActiveOrg = orgs.length > 0 && !activeOrg;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar isSuperAdmin={isSuperAdmin} />
        <SidebarInset className="flex flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
            <SidebarTrigger />
            <div className="flex-1" />
            {orgs.length > 0 && (
              <Select value={orgId ?? undefined} onValueChange={setOrgId}>
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </header>
          <main className="flex-1 px-6 py-8">
            {orgsQuery.isLoading || waitingForActiveOrg ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !hasShellAccess ? (
              <div className="rounded-md border border-border bg-card p-6">
                <h2 className="text-base font-semibold">No organizations</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You're signed in but not a member of any organization. Ask an
                  admin to invite you.
                </p>
              </div>
            ) : (
              <OrgContext.Provider
                value={{
                  orgId: orgId ?? "",
                  orgName: activeOrg?.name ?? "",
                  isAdmin: !!isAdmin,
                  isSuperAdmin,
                  hasActiveOrg: !!activeOrg,
                }}
              >
                {children}
              </OrgContext.Provider>
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

type OrgCtx = {
  orgId: string;
  orgName: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  hasActiveOrg: boolean;
};
const OrgContext = createContext<OrgCtx | null>(null);
export function useActiveOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx)
    throw new Error("useActiveOrg must be inside AppShell org-scoped content");
  return ctx;
}
