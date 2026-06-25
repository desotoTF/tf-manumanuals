import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
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
import { Factory, LogOut } from "lucide-react";

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
    setOrgId: (id: string) => {
      localStorage.setItem(ACTIVE_ORG_KEY, id);
      setOrgId(id);
    },
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

  // Default active org to first one
  useEffect(() => {
    if (!orgId && orgsQuery.data && orgsQuery.data.length > 0) {
      setOrgId(orgsQuery.data[0].id);
    }
  }, [orgId, orgsQuery.data, setOrgId]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth" });
  };

  const orgs = orgsQuery.data ?? [];
  const activeOrg = orgs.find((o) => o.id === orgId);
  const isAdmin =
    activeOrg?.roles.includes("owner") || activeOrg?.roles.includes("admin");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link
              to="/products"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
            >
              <Factory className="h-5 w-5 text-primary" />
              ManuManuals
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              <NavLink to="/products">Products</NavLink>
              <NavLink to="/settings/team">Team</NavLink>
              <NavLink to="/settings/erp">ERP</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {orgs.length > 0 && (
              <Select value={orgId ?? undefined} onValueChange={setOrgId}>
                <SelectTrigger className="h-9 w-48">
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
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        {orgsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : orgs.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-6">
            <h2 className="text-base font-semibold">No organizations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You're signed in but not a member of any organization. Ask an
              admin to invite you.
            </p>
          </div>
        ) : (
          <OrgContext.Provider
            value={{ orgId: orgId!, orgName: activeOrg?.name ?? "", isAdmin: !!isAdmin }}
          >
            {children}
          </OrgContext.Provider>
        )}
      </main>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      activeProps={{ className: "bg-accent text-foreground" }}
    >
      {children}
    </Link>
  );
}

import { createContext, useContext } from "react";
type OrgCtx = { orgId: string; orgName: string; isAdmin: boolean };
const OrgContext = createContext<OrgCtx | null>(null);
export function useActiveOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useActiveOrg must be inside AppShell org-scoped content");
  return ctx;
}
