import { FeedbackWidget } from "@/components/FeedbackWidget";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { LogOut, UserCircle2, HelpCircle, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getOrgUsage } from "@/lib/plans.functions";
import { listErpConnections } from "@/lib/erp.functions";
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
  const queryClient = useQueryClient();
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
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth", replace: true });
  };

  const activeOrg = orgs.find((o) => o.id === orgId);

  // Advanced (ERP / BOM) shows only when the plan includes Odoo or the org
  // already has an ERP connection configured. Pages themselves stay reachable.
  const fetchUsage = useServerFn(getOrgUsage);
  const fetchErp = useServerFn(listErpConnections);
  const usageQ = useQuery({
    queryKey: ["org-usage", activeOrg?.id],
    queryFn: () => fetchUsage({ data: { organizationId: activeOrg!.id } }),
    enabled: !!activeOrg,
  });
  const erpQ = useQuery({
    queryKey: ["erp-connections-nav", activeOrg?.id],
    queryFn: () => fetchErp({ data: { organizationId: activeOrg!.id } }),
    enabled: !!activeOrg,
  });
  const showAdvanced =
    !!usageQ.data?.limits?.features?.includes("odoo") || (erpQ.data?.length ?? 0) > 0;
  const [email, setEmail] = useState<string>("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);
  const isAdmin =
    activeOrg?.roles.includes("owner") || activeOrg?.roles.includes("admin");

  // For super admins with no org membership, still show the shell so they can
  // reach /admin/* routes.
  const hasShellAccess = orgs.length > 0 || isSuperAdmin;
  const waitingForActiveOrg = orgs.length > 0 && !activeOrg;

  return (
    <SidebarProvider>
      <div className="mm mm-app flex min-h-screen w-full bg-background">
        <AppSidebar isSuperAdmin={isSuperAdmin} showAdvanced={showAdvanced} />
        <SidebarInset className="flex min-w-0 flex-1 flex-col bg-background">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur md:px-4">
            <SidebarTrigger aria-label="Toggle sidebar" />
            <Breadcrumb />
            <div className="flex-1" />
            {orgs.length > 1 ? (
              <Select value={orgId ?? undefined} onValueChange={setOrgId}>
                <SelectTrigger className="h-9 w-40 sm:w-56" aria-label="Organization">
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
            ) : activeOrg ? (
              <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">{activeOrg.name}</span>
            ) : null}
            <div className="hidden sm:block"><FeedbackWidget orgId={orgId} /></div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Account menu" className="gap-1 px-2">
                  <UserCircle2 className="h-5 w-5" aria-hidden />
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {email && <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}</DropdownMenuLabel>}
                <DropdownMenuItem asChild><Link to="/account">Account</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/help"><HelpCircle className="mr-2 h-4 w-4" />Help center</Link></DropdownMenuItem>
                <DropdownMenuItem className="sm:hidden" onSelect={() => window.dispatchEvent(new CustomEvent("mm:feedback", { detail: "general" }))}>Send feedback</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
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
                  orgSlug: activeOrg?.slug ?? "",
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
  orgSlug: string;
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

const CRUMBS: Array<[RegExp, string, string?]> = [
  [/^\/products\/.+/, "Manual", "Manuals"],
  [/^\/products$/, "Manuals"],
  [/^\/settings\/templates/, "Templates", "Manage"],
  [/^\/settings\/team/, "Team", "Manage"],
  [/^\/settings\/organization/, "Organization", "Manage"],
  [/^\/settings\/integrations/, "Integrations", "Manage"],
  [/^\/settings\/billing/, "Plan & billing", "Manage"],
  [/^\/settings\/erp/, "ERP", "Advanced"],
  [/^\/settings\/bom-exclusions/, "BOM settings", "Advanced"],
  [/^\/account/, "Account"],
  [/^\/admin\//, "Platform admin"],
];
function Breadcrumb() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hit = CRUMBS.find(([re]) => re.test(pathname));
  if (!hit) return null;
  const [, label, parent] = hit;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 truncate text-sm">
      {parent === "Manuals" ? (
        <Link to="/products" className="text-muted-foreground hover:text-foreground">Manuals</Link>
      ) : parent ? (
        <span className="hidden text-muted-foreground sm:inline">{parent}</span>
      ) : null}
      {parent && <span className="mx-1.5 text-muted-foreground" aria-hidden>/</span>}
      <span className="font-medium text-foreground">{label}</span>
    </nav>
  );
}
