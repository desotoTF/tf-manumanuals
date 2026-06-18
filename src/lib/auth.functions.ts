// Server functions for tenancy: list current user's orgs, fetch org members.
// Auth gating itself is handled by the integration-managed _authenticated layout.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMyOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("memberships")
      .select(
        "organization_id, organizations:organizations(id, name, slug, created_at)",
      )
      .eq("user_id", userId);
    if (error) throw error;
    const orgs = (data ?? [])
      .map((m) => m.organizations)
      .filter((o): o is NonNullable<typeof o> => !!o);
    // Fetch roles
    const { data: roles } = await supabase
      .from("org_roles")
      .select("organization_id, role")
      .eq("user_id", userId);
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const list = roleMap.get(r.organization_id) ?? [];
      list.push(r.role);
      roleMap.set(r.organization_id, list);
    });
    return orgs.map((o) => ({ ...o, roles: roleMap.get(o.id) ?? [] }));
  });

export const getOrgMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: members, error } = await supabase
      .from("memberships")
      .select("user_id, created_at, profiles:profiles(id, full_name, email)")
      .eq("organization_id", data.organizationId);
    if (error) throw error;
    const { data: roles } = await supabase
      .from("org_roles")
      .select("user_id, role")
      .eq("organization_id", data.organizationId);
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const list = roleMap.get(r.user_id) ?? [];
      list.push(r.role);
      roleMap.set(r.user_id, list);
    });
    return (members ?? []).map((m) => ({
      user_id: m.user_id,
      created_at: m.created_at,
      profile: m.profiles,
      roles: roleMap.get(m.user_id) ?? [],
    }));
  });
