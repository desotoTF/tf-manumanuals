// Organization profile settings: name + public URL handle (slug) used for
// branded public manual links at /m/<slug>/<manual>.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const RESERVED_ORG_SLUGS = [
  "admin",
  "api",
  "app",
  "auth",
  "dashboard",
  "m",
  "manuals",
  "products",
  "settings",
  "static",
  "support",
  "www",
];

export function normalizeOrgSlug(raw: string) {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const getOrgProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase
      .from("organizations")
      .select("id, name, slug")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (error) throw error;
    return org;
  });

export const updateOrgProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        slug: z.string().min(2).max(63).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: allowed } = await supabase.rpc("has_org_any_role", {
      _org_id: data.organizationId,
      _roles: ["owner", "admin"],
    });
    if (!allowed) throw new Error("Only organization owners and admins can change these settings.");

    const patch: { name?: string; slug?: string } = {};
    if (data.name !== undefined) patch.name = data.name.trim();

    if (data.slug !== undefined) {
      const slug = normalizeOrgSlug(data.slug);
      if (slug.length < 2) throw new Error("Use at least 2 letters or numbers.");
      if (RESERVED_ORG_SLUGS.includes(slug)) throw new Error(`"${slug}" is reserved. Pick another.`);

      const { data: taken } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", slug)
        .neq("id", data.organizationId)
        .maybeSingle();
      if (taken) throw new Error(`"${slug}" is already taken. Pick another.`);
      patch.slug = slug;
    }

    if (Object.keys(patch).length === 0) return { ok: true as const };

    const { error } = await supabase
      .from("organizations")
      .update(patch)
      .eq("id", data.organizationId);
    if (error) {
      if (error.code === "23505") throw new Error("That address is already taken. Pick another.");
      throw error;
    }
    return { ok: true as const, ...patch };
  });
