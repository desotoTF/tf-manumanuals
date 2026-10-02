// Export / import of a single manual as a portable bundle (.zip with
// manual.json + image files). Server side only supplies data and creates
// the empty manual; images move through the existing upload functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emptyManualContent } from "./types";

const uuid = z.string().uuid();

export const getManualExport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ manualId: uuid, versionId: uuid.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: manual, error } = await supabase
      .from("manuals")
      .select("id, title, source, products!inner(sku, name, description)")
      .eq("id", data.manualId)
      .maybeSingle();
    if (error) throw error;
    if (!manual) throw new Error("Manual not found");

    let q = supabase
      .from("manual_versions")
      .select("id, version_number, state, content, change_summary")
      .eq("manual_id", data.manualId);
    q = data.versionId ? q.eq("id", data.versionId) : q.order("version_number", { ascending: false }).limit(1);
    const { data: version, error: vErr } = await q.maybeSingle();
    if (vErr) throw vErr;
    if (!version) throw new Error("No version to export");

    const { data: assets } = await supabase
      .from("manual_assets")
      .select("id, type, url, metadata")
      .eq("manual_version_id", version.id);

    const product = (manual as unknown as { products: { sku: string; name: string; description: string | null } }).products;
    // Sent as a JSON string: manual content is free-form JSON.
    return JSON.stringify({
      title: manual.title,
      product,
      version: { number: version.version_number, state: version.state },
      content: version.content as Record<string, unknown>,
      assets: (assets ?? []).map((a) => ({
        id: a.id,
        type: a.type,
        url: a.url,
        metadata: (a.metadata ?? {}) as Record<string, unknown>,
      })),
    });
  });

// Creates the product + manual + empty v1 draft that an imported bundle is
// loaded into. Plan limits are enforced by the existing database trigger.
export const createImportedManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: uuid,
        title: z.string().trim().min(1).max(300),
        sku: z.string().trim().min(1).max(120),
        name: z.string().trim().min(1).max(300),
        description: z.string().max(5000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canEdit } = await supabase.rpc("has_org_any_role", {
      _org_id: data.organizationId,
      _roles: ["owner", "admin", "editor"],
    });
    if (!canEdit) throw new Error("You need editor access to import manuals.");

    // Pick a SKU that doesn't collide with an existing product in this org.
    let sku = data.sku;
    for (let i = 2; i < 50; i++) {
      const { data: hit } = await supabase
        .from("products")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("sku", sku)
        .maybeSingle();
      if (!hit) break;
      sku = `${data.sku}-${i}`;
    }
    const slug =
      (sku.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "manual") +
      `-${Date.now().toString(36).slice(-5)}`;

    const { data: prod, error: pErr } = await supabase
      .from("products")
      .insert({
        organization_id: data.organizationId,
        sku,
        name: data.name,
        description: data.description ?? null,
        is_active: true,
        web_slug: slug,
      })
      .select("id")
      .single();
    if (pErr) throw pErr;

    const { data: manual, error: mErr } = await supabase
      .from("manuals")
      .insert({ product_id: prod.id, title: data.title, created_by: userId, source: "imported" } as never)
      .select("id")
      .single();
    if (mErr) {
      await supabase.from("products").delete().eq("id", prod.id);
      throw mErr;
    }
    const manualId = (manual as { id: string }).id;

    const { data: version, error: vErr } = await supabase
      .from("manual_versions")
      .insert({
        manual_id: manualId,
        version_number: 1,
        state: "draft",
        content: emptyManualContent() as never,
        change_summary: "Imported from a manual export",
        created_by: userId,
      })
      .select("id")
      .single();
    if (vErr) throw vErr;

    return { productId: prod.id, manualId, versionId: version.id, sku };
  });
