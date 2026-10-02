// Per-organization part catalog. Stores an optional friendly alias and
// thumbnail image per SKU so the manual editor + PDF can enrich BOM lines
// without changing the manual JSON. Admins/owners only for writes; any org
// member can read.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type PartCatalogRow =
  Database["public"]["Tables"]["part_catalog"]["Row"];

const uuid = z.string().uuid();

async function assertAdmin(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  orgId: string,
) {
  const { data, error } = await supabase.rpc("has_org_any_role", {
    _org_id: orgId,
    _roles: ["owner", "admin"],
  });
  if (error) throw error;
  if (!data) {
    const { data: sa } = await supabase.rpc("is_super_admin", {});
    if (!sa) throw new Error("Forbidden: admin role required");
  }
}

export const listPartCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: uuid,
        skus: z.array(z.string().min(1)).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("part_catalog")
      .select("*")
      .eq("organization_id", data.organizationId);
    if (data.skus && data.skus.length > 0) {
      q = q.in("sku", data.skus);
    }
    const { data: rows, error } = await q.order("sku", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as PartCatalogRow[];
  });

export const upsertPartCatalogAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: uuid,
        sku: z.string().min(1).max(200),
        alias: z.string().max(500).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, data.organizationId);
    const alias = data.alias?.trim() ? data.alias.trim() : null;
    const { data: row, error } = await context.supabase
      .from("part_catalog")
      .upsert(
        {
          organization_id: data.organizationId,
          sku: data.sku,
          alias,
          created_by: context.userId,
          updated_by: context.userId,
        },
        { onConflict: "organization_id,sku" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return row as PartCatalogRow;
  });

export const uploadPartCatalogImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: uuid,
        sku: z.string().min(1).max(200),
        filename: z.string().min(1).max(200),
        contentType: z.string().min(1).max(120),
        // base64 (no data: prefix). Cap ~4MB raw → ~5.5MB encoded.
        dataBase64: z.string().min(1).max(6_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, data.organizationId);

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const safeSku = data.sku.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `part-catalog/${data.organizationId}/${safeSku}/${Date.now()}-${safeName}`;
    const bytes = Buffer.from(data.dataBase64, "base64");

    const { error: upErr } = await supabaseAdmin.storage
      .from("manual-assets")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("manual-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (sErr) throw new Error(`Signing URL failed: ${sErr.message}`);

    const { data: row, error } = await context.supabase
      .from("part_catalog")
      .upsert(
        {
          organization_id: data.organizationId,
          sku: data.sku,
          image_path: path,
          image_url: signed.signedUrl,
          created_by: context.userId,
          updated_by: context.userId,
        },
        { onConflict: "organization_id,sku" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return row as PartCatalogRow;
  });

export const clearPartCatalogImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("part_catalog")
      .select("id, organization_id, image_path")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) throw new Error("Entry not found");
    await assertAdmin(context.supabase as never, existing.organization_id);

    if (existing.image_path) {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      await supabaseAdmin.storage
        .from("manual-assets")
        .remove([existing.image_path]);
    }
    const { error } = await context.supabase
      .from("part_catalog")
      .update({ image_path: null, image_url: null, updated_by: context.userId })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

export const deletePartCatalogEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("part_catalog")
      .select("id, organization_id, image_path")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return { ok: true as const };
    await assertAdmin(context.supabase as never, existing.organization_id);

    if (existing.image_path) {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      await supabaseAdmin.storage
        .from("manual-assets")
        .remove([existing.image_path]);
    }
    const { error } = await context.supabase
      .from("part_catalog")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
