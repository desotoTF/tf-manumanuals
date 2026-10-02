import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  BookOpen,
  Users,
  Plug,
  Building2,
  ShieldCheck,
  ScrollText,
  UserCircle2,
  LayoutTemplate,
  Filter,
  Blocks,
  MessageSquare,
  CreditCard,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { ManuMark } from "@/components/ManuMark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Item = { title: string; url: string; icon: typeof BookOpen };

const workspace: Item[] = [{ title: "Manuals", url: "/products", icon: BookOpen }];
const manage: Item[] = [
  { title: "Templates", url: "/settings/templates", icon: LayoutTemplate },
  { title: "Team", url: "/settings/team", icon: Users },
  { title: "Organization", url: "/settings/organization", icon: Building2 },
  { title: "Integrations", url: "/settings/integrations", icon: Blocks },
  { title: "Plan & billing", url: "/settings/billing", icon: CreditCard },
];
const advanced: Item[] = [
  { title: "ERP", url: "/settings/erp", icon: Plug },
  { title: "BOM settings", url: "/settings/bom-exclusions", icon: Filter },
];
const admin: Item[] = [
  { title: "Organizations", url: "/admin/orgs", icon: Building2 },
  { title: "Users", url: "/admin/users", icon: ShieldCheck },
  { title: "Audit log", url: "/admin/audit", icon: ScrollText },
  { title: "Feedback inbox", url: "/admin/feedback", icon: Inbox },
];

export function AppSidebar({
  isSuperAdmin,
  showAdvanced,
}: {
  isSuperAdmin: boolean;
  showAdvanced: boolean;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");
  const [advOpen, setAdvOpen] = useState(() => advanced.some((i) => isActive(i.url)));
  const [adminOpen, setAdminOpen] = useState(() => admin.some((i) => isActive(i.url)));

  const renderItems = (items: Item[], subdued = false) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton
            asChild
            isActive={isActive(item.url)}
            tooltip={item.title}
            className={
              "data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_2px_0_0_var(--sidebar-primary)] " +
              (subdued ? "text-muted-foreground" : "")
            }
          >
            <Link to={item.url} className="flex items-center gap-2">
              <item.icon className="h-4 w-4" aria-hidden />
              <span>{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  const collapsibleGroup = (
    label: string,
    items: Item[],
    open: boolean,
    setOpen: (v: boolean) => void,
  ) =>
    collapsed ? (
      <SidebarGroup>
        <SidebarGroupContent>{renderItems(items, true)}</SidebarGroupContent>
      </SidebarGroup>
    ) : (
      <Collapsible open={open} onOpenChange={setOpen}>
        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="flex w-full items-center justify-between">
              {label}
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
                aria-hidden
              />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
            <SidebarGroupContent>{renderItems(items, true)}</SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/products" className="flex items-center gap-2 px-2 py-1.5" aria-label="ThumperFab — Manuals">
          <ManuMark className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="text-sm font-semibold tracking-tight">ThumperFab</span>}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>{renderItems(workspace)}</SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>{renderItems(manage)}</SidebarGroupContent>
        </SidebarGroup>
        {showAdvanced && collapsibleGroup("Advanced", advanced, advOpen, setAdvOpen)}
        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/account")} tooltip="Account">
                  <Link to="/account" className="flex items-center gap-2">
                    <UserCircle2 className="h-4 w-4" aria-hidden />
                    <span>Account</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Feedback"
                  onClick={() => window.dispatchEvent(new CustomEvent("mm:feedback", { detail: "general" }))}
                >
                  <MessageSquare className="h-4 w-4" aria-hidden />
                  <span>Feedback</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {isSuperAdmin && (
        <SidebarFooter className="p-0">
          <SidebarSeparator />
          {collapsibleGroup("Platform admin", admin, adminOpen, setAdminOpen)}
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
