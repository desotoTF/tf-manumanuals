// Super-admin server functions. Every handler checks is_super_admin() first.
// Privileged Auth Admin / cross-tenant writes load supabaseAdmin inside the handler.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type OrgRole = Database["public"]["Enums"]["org_role"];

async function ensureSuperAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error) throw error;
  if (!data) throw new Error("Forbidden: super_admin required");
}

async function recordAudit(
  actorUserId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  payload: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  await supabaseAdmin.from("platform_audit").insert({
    actor_user_id: actorUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    payload: payload as any,
  });
}

// ── Organizations ────────────────────────────────────────────────────────────
export const adminListOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: orgs, error } = await supabaseAdmin
      .from("organizations")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Aggregate counts
    const { data: members } = await supabaseAdmin
      .from("memberships")
      .select("organization_id");
    const { data: conns } = await supabaseAdmin
      .from("erp_connections")
      .select("organization_id, is_active");

    const memberCounts = new Map<string, number>();
    (members ?? []).forEach((m) => {
      memberCounts.set(
        m.organization_id,
        (memberCounts.get(m.organization_id) ?? 0) + 1,
      );
    });
    const connCounts = new Map<string, number>();
    (conns ?? []).forEach((c) => {
      connCounts.set(
        c.organization_id,
        (connCounts.get(c.organization_id) ?? 0) + 1,
      );
    });

    return (orgs ?? []).map((o) => ({
      ...o,
      member_count: memberCounts.get(o.id) ?? 0,
      connection_count: connCounts.get(o.id) ?? 0,
    }));
  });

export const adminCreateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(100),
        slug: z
          .string()
          .min(2)
          .max(60)
          .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, hyphens only"),
        initialOwnerEmail: z.string().email().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: created, error } = await supabaseAdmin
      .from("organizations")
      .insert({ name: data.name, slug: data.slug })
      .select("id, name, slug")
      .single();
    if (error) throw error;

    let ownerInfo: { userId: string; created: boolean } | null = null;
    if (data.initialOwnerEmail) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers();
      let user = list.users.find(
        (u) =>
          u.email?.toLowerCase() === data.initialOwnerEmail!.toLowerCase(),
      );
      let createdUser = false;
      if (!user) {
        const { data: c, error: cErr } =
          await supabaseAdmin.auth.admin.createUser({
            email: data.initialOwnerEmail,
            email_confirm: true,
          });
        if (cErr) throw cErr;
        user = c.user!;
        createdUser = true;
      }
      await supabaseAdmin
        .from("memberships")
        .upsert(
          { organization_id: created.id, user_id: user.id },
          { onConflict: "organization_id,user_id", ignoreDuplicates: true },
        );
      await supabaseAdmin
        .from("org_roles")
        .upsert(
          [
            { organization_id: created.id, user_id: user.id, role: "owner" },
            { organization_id: created.id, user_id: user.id, role: "admin" },
          ],
          {
            onConflict: "organization_id,user_id,role",
            ignoreDuplicates: true,
          },
        );
      ownerInfo = { userId: user.id, created: createdUser };
    }

    await recordAudit(
      context.userId,
      "org.create",
      "organization",
      created.id,
      { name: data.name, slug: data.slug, initialOwnerEmail: data.initialOwnerEmail ?? null },
    );

    return { organization: created, owner: ownerInfo };
  });

export const adminUpdateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        slug: z
          .string()
          .min(2)
          .max(60)
          .regex(/^[a-z0-9-]+$/)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const patch: { name?: string; slug?: string } = {};
    if (data.name) patch.name = data.name;
    if (data.slug) patch.slug = data.slug;
    const { error } = await supabaseAdmin
      .from("organizations")
      .update(patch)
      .eq("id", data.organizationId);
    if (error) throw error;
    await recordAudit(
      context.userId,
      "org.update",
      "organization",
      data.organizationId,
      patch,
    );
    return { ok: true };
  });

export const adminDeleteOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin
      .from("organizations")
      .delete()
      .eq("id", data.organizationId);
    if (error) throw error;
    await recordAudit(
      context.userId,
      "org.delete",
      "organization",
      data.organizationId,
      {},
    );
    return { ok: true };
  });

export const adminGetOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .select("id, name, slug, created_at")
      .eq("id", data.organizationId)
      .single();
    if (error) throw error;

    const { data: members } = await supabaseAdmin
      .from("memberships")
      .select("user_id, created_at, profiles:profiles(id, full_name, email)")
      .eq("organization_id", data.organizationId);
    const { data: roles } = await supabaseAdmin
      .from("org_roles")
      .select("user_id, role")
      .eq("organization_id", data.organizationId);
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const list = roleMap.get(r.user_id) ?? [];
      list.push(r.role);
      roleMap.set(r.user_id, list);
    });

    const { data: invites } = await supabaseAdmin
      .from("invitations")
      .select("id, email, role, expires_at, accepted_at, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });

    const { data: connections } = await supabaseAdmin
      .from("erp_connections")
      .select(
        "id, provider, name, base_url, is_active, last_sync_at, last_sync_status",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });

    return {
      organization: org,
      members: (members ?? []).map((m) => ({
        user_id: m.user_id,
        created_at: m.created_at,
        profile: m.profiles,
        roles: roleMap.get(m.user_id) ?? [],
      })),
      invitations: invites ?? [],
      connections: connections ?? [],
    };
  });

// ── Members & roles ──────────────────────────────────────────────────────────
const ORG_ROLES = ["owner", "admin", "editor", "viewer"] as const;

export const adminAddMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        email: z.string().email(),
        roles: z.array(z.enum(ORG_ROLES)).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    let user = list.users.find(
      (u) => u.email?.toLowerCase() === data.email.toLowerCase(),
    );
    if (!user) {
      const { data: c, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        email_confirm: true,
      });
      if (error) throw error;
      user = c.user!;
    }
    await supabaseAdmin
      .from("memberships")
      .upsert(
        { organization_id: data.organizationId, user_id: user.id },
        { onConflict: "organization_id,user_id", ignoreDuplicates: true },
      );
    await supabaseAdmin.from("org_roles").upsert(
      data.roles.map((r) => ({
        organization_id: data.organizationId,
        user_id: user!.id,
        role: r as OrgRole,
      })),
      {
        onConflict: "organization_id,user_id,role",
        ignoreDuplicates: true,
      },
    );
    await recordAudit(
      context.userId,
      "member.add",
      "organization",
      data.organizationId,
      { email: data.email, roles: data.roles },
    );
    return { ok: true, userId: user.id };
  });

export const adminSetMemberRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        userId: z.string().uuid(),
        roles: z.array(z.enum(ORG_ROLES)),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    // Replace role set transactionally enough: delete existing, insert new.
    await supabaseAdmin
      .from("org_roles")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId);
    if (data.roles.length > 0) {
      await supabaseAdmin.from("org_roles").insert(
        data.roles.map((r) => ({
          organization_id: data.organizationId,
          user_id: data.userId,
          role: r as OrgRole,
        })),
      );
    }
    await recordAudit(
      context.userId,
      "member.set_roles",
      "organization",
      data.organizationId,
      { userId: data.userId, roles: data.roles },
    );
    return { ok: true };
  });

export const adminRemoveMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        userId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await supabaseAdmin
      .from("org_roles")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId);
    await supabaseAdmin
      .from("memberships")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId);
    await recordAudit(
      context.userId,
      "member.remove",
      "organization",
      data.organizationId,
      { userId: data.userId },
    );
    return { ok: true };
  });

// ── Users & platform roles ───────────────────────────────────────────────────
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ search: z.string().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    let q = supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`email.ilike.${s},full_name.ilike.${s}`);
    }
    const { data: profiles, error } = await q;
    if (error) throw error;

    const ids = (profiles ?? []).map((p) => p.id);
    const { data: platformRoles } = await supabaseAdmin
      .from("platform_roles")
      .select("user_id, role")
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const { data: memberships } = await supabaseAdmin
      .from("memberships")
      .select(
        "user_id, organization_id, organizations:organizations(name, slug)",
      )
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

    const platformMap = new Map<string, string[]>();
    (platformRoles ?? []).forEach((r) => {
      const arr = platformMap.get(r.user_id) ?? [];
      arr.push(r.role);
      platformMap.set(r.user_id, arr);
    });
    const memberMap = new Map<
      string,
      { id: string; name: string; slug: string }[]
    >();
    (memberships ?? []).forEach((m) => {
      const o = m.organizations;
      if (!o) return;
      const arr = memberMap.get(m.user_id) ?? [];
      arr.push({ id: m.organization_id, name: o.name, slug: o.slug });
      memberMap.set(m.user_id, arr);
    });

    return (profiles ?? []).map((p) => ({
      ...p,
      platform_roles: platformMap.get(p.id) ?? [],
      organizations: memberMap.get(p.id) ?? [],
    }));
  });

export const adminGrantSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await supabaseAdmin
      .from("platform_roles")
      .upsert(
        { user_id: data.userId, role: "super_admin", granted_by: context.userId },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    await recordAudit(
      context.userId,
      "platform_role.grant",
      "user",
      data.userId,
      { role: "super_admin" },
    );
    return { ok: true };
  });

export const adminRevokeSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    if (data.userId === context.userId) {
      throw new Error("Refusing to revoke your own super_admin role");
    }
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await supabaseAdmin
      .from("platform_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "super_admin");
    await recordAudit(
      context.userId,
      "platform_role.revoke",
      "user",
      data.userId,
      { role: "super_admin" },
    );
    return { ok: true };
  });

// ── Audit ────────────────────────────────────────────────────────────────────
export const adminListAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: platform } = await supabaseAdmin
      .from("platform_audit")
      .select("id, actor_user_id, action, target_type, target_id, payload, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(200);
    const { data: cred } = await supabaseAdmin
      .from("erp_credential_audit")
      .select("id, actor_user_id, action, erp_connection_id, note, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(200);
    const { data: sync } = await supabaseAdmin
      .from("sync_events")
      .select(
        "id, organization_id, erp_connection_id, product_id, event_type, payload, occurred_at",
      )
      .order("occurred_at", { ascending: false })
      .limit(200);

    // Resolve actor names
    const actorIds = new Set<string>();
    (platform ?? []).forEach((p) => p.actor_user_id && actorIds.add(p.actor_user_id));
    (cred ?? []).forEach((p) => p.actor_user_id && actorIds.add(p.actor_user_id));
    const { data: actors } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", actorIds.size ? Array.from(actorIds) : ["00000000-0000-0000-0000-000000000000"]);
    const actorMap = new Map(
      (actors ?? []).map((a) => [a.id, a.email ?? a.full_name ?? a.id] as const),
    );

    const platformItems = (platform ?? []).map((p) => ({
      kind: "platform" as const,
      id: p.id,
      occurred_at: p.occurred_at,
      actor: p.actor_user_id ? actorMap.get(p.actor_user_id) ?? p.actor_user_id : "—",
      action: p.action,
      detail: { target_type: p.target_type, target_id: p.target_id, ...((p.payload as any) ?? {}) },
    }));
    const credItems = (cred ?? []).map((p) => ({
      kind: "credential" as const,
      id: p.id,
      occurred_at: p.occurred_at,
      actor: p.actor_user_id ? actorMap.get(p.actor_user_id) ?? p.actor_user_id : "—",
      action: `erp.${p.action}`,
      detail: { connection_id: p.erp_connection_id, note: p.note },
    }));
    const syncItems = (sync ?? []).map((p) => ({
      kind: "sync" as const,
      id: p.id,
      occurred_at: p.occurred_at,
      actor: "system",
      action: p.event_type,
      detail: {
        organization_id: p.organization_id,
        connection_id: p.erp_connection_id,
        product_id: p.product_id,
        ...((p.payload as any) ?? {}),
      },
    }));

    return [...platformItems, ...credItems, ...syncItems]
      .sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at))
      .slice(0, 300);
  });
