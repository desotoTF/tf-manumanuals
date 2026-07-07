import type { SupabaseClient } from "@supabase/supabase-js";
import { odooAuthenticate, odooExecuteKw } from "./odoo-xmlrpc.server";

export async function syncBomBySkuImpl(
  supabase: SupabaseClient,
  params: { organizationId: string; sku: string; connectionId?: string },
): Promise<{
  ok: boolean;
  found: boolean;
  productId?: string;
  snapshotId?: string;
  lineCount?: number;
  sku: string;
  error?: string;
}> {
  const sku = params.sku.trim().toUpperCase();

  const { data: conn } = params.connectionId
    ? await supabase
        .from("erp_connections")
        .select("id, base_url, database, username, organization_id")
        .eq("id", params.connectionId)
        .maybeSingle()
    : await supabase
        .from("erp_connections")
        .select("id, base_url, database, username, organization_id")
        .eq("organization_id", params.organizationId)
        .eq("provider", "odoo")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
  if (!conn) return { ok: false, found: false, sku, error: "No active Odoo connection" };

  try {
    const { data: cred, error: credErr } = await supabase.rpc("erp_read_credentials", {
      _connection_id: conn.id,
    });
    if (credErr) throw credErr;
    const apiKey = (cred as { api_key?: string } | null)?.api_key;
    if (!apiKey) throw new Error("No stored credential for Odoo");

    const creds = {
      baseUrl: conn.base_url,
      database: conn.database ?? "",
      username: conn.username,
      apiKey,
    };
    const uid = await odooAuthenticate(creds);

    let tmplId: number | null = null;
    let variantId: number | null = null;
    let tmplName = sku;
    let tmplDescription: string | null = null;

    const tmplRows = await odooExecuteKw<
      Array<{
        id: number;
        name: string;
        default_code: string | false;
        description_sale: string | false;
        product_variant_id?: [number, string] | false;
      }>
    >(creds, uid, "product.template", "search_read", [[[
      "default_code",
      "=ilike",
      sku,
    ]]], {
      fields: ["id", "name", "default_code", "description_sale", "product_variant_id"],
      limit: 1,
      context: { active_test: false },
    });

    if (tmplRows?.[0]) {
      tmplId = tmplRows[0].id;
      tmplName = tmplRows[0].name;
      tmplDescription = tmplRows[0].description_sale ? String(tmplRows[0].description_sale) : null;
      if (Array.isArray(tmplRows[0].product_variant_id)) variantId = tmplRows[0].product_variant_id[0];

      const exactVariants = await odooExecuteKw<
        Array<{ id: number; name: string; default_code: string | false; product_tmpl_id: [number, string] | false }>
      >(creds, uid, "product.product", "search_read", [[
        ["default_code", "=ilike", sku],
        ["product_tmpl_id", "=", tmplId],
      ]], {
        fields: ["id", "name", "default_code", "product_tmpl_id"],
        limit: 1,
        context: { active_test: false },
      });
      if (exactVariants?.[0]) variantId = exactVariants[0].id;
    } else {
      const variantRows = await odooExecuteKw<
        Array<{ id: number; name: string; product_tmpl_id: [number, string] | false }>
      >(creds, uid, "product.product", "search_read", [[
        "&",
        ["default_code", "=ilike", sku],
        "|",
        ["active", "=", true],
        ["active", "=", false],
      ]], {
        fields: ["id", "name", "product_tmpl_id"],
        limit: 1,
        context: { active_test: false },
      });
      const variant = variantRows?.[0];
      if (variant?.product_tmpl_id) {
        tmplId = variant.product_tmpl_id[0];
        variantId = variant.id;
        tmplName = variant.name;
      }
    }

    if (tmplId === null) return { ok: true, found: false, sku };

    const bomDomain = (variantId !== null
      ? ["|", ["product_id", "=", variantId], ["product_tmpl_id", "=", tmplId]]
      : [["product_tmpl_id", "=", tmplId]]) as never;
    const boms = await odooExecuteKw<
      Array<{ id: number; code: string | false; product_qty: number }>
    >(creds, uid, "mrp.bom", "search_read", [bomDomain], {
      fields: ["id", "code", "product_qty"],
      limit: 1,
      context: { active_test: false },
    });
    const bom = boms?.[0];

    const slugBase = sku.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `tmpl-${tmplId}`;
    const { data: prod } = await supabase
      .from("products")
      .upsert(
        {
          organization_id: conn.organization_id,
          erp_connection_id: conn.id,
          erp_product_id: String(tmplId),
          sku,
          name: tmplName,
          description: tmplDescription,
          is_active: true,
          web_slug: slugBase,
        },
        { onConflict: "organization_id,sku" },
      )
      .select("id")
      .single();
    const productId = prod?.id;
    if (!productId) return { ok: false, found: false, sku, error: "Could not upsert product" };
    if (!bom) return { ok: true, found: false, productId, sku };

    const lines = await odooExecuteKw<Array<Record<string, unknown>>>(
      creds,
      uid,
      "mrp.bom.line",
      "search_read",
      [[["bom_id", "=", bom.id]]],
      { fields: ["product_id", "product_qty", "product_uom_id"], limit: 500 },
    );

    const variantIds = Array.from(
      new Set(
        lines
          .map((line) => {
            const field = line.product_id;
            return Array.isArray(field) && typeof field[0] === "number" ? (field[0] as number) : null;
          })
          .filter((value): value is number => value !== null),
      ),
    );
    const variantToTemplateSku = new Map<number, string>();
    if (variantIds.length > 0) {
      const variantRows = await odooExecuteKw<
        Array<{ id: number; product_tmpl_id: [number, string] | false }>
      >(creds, uid, "product.product", "read", [variantIds], {
        fields: ["id", "product_tmpl_id"],
      });
      const tmplIds = Array.from(
        new Set(
          variantRows
            .map((row) => (Array.isArray(row.product_tmpl_id) ? row.product_tmpl_id[0] : null))
            .filter((value): value is number => value !== null),
        ),
      );
      const tmplSkuById = new Map<number, string>();
      if (tmplIds.length > 0) {
        const tmplRowsForLines = await odooExecuteKw<
          Array<{ id: number; default_code: string | false }>
        >(creds, uid, "product.template", "read", [tmplIds], {
          fields: ["id", "default_code"],
        });
        for (const tmpl of tmplRowsForLines) {
          if (tmpl.default_code) tmplSkuById.set(tmpl.id, String(tmpl.default_code));
        }
      }
      for (const variant of variantRows) {
        const tmpl = Array.isArray(variant.product_tmpl_id) ? variant.product_tmpl_id[0] : null;
        const templateSku = tmpl !== null ? tmplSkuById.get(tmpl) : undefined;
        if (templateSku) variantToTemplateSku.set(variant.id, templateSku);
      }
    }

    const { normalizeBomLines, sha256Hex } = await import("./erp-utils");
    const normalized = normalizeBomLines(lines, variantToTemplateSku);
    const hash = await sha256Hex(JSON.stringify(normalized));

    const { data: snapIns, error: sErr } = await supabase
      .from("bom_snapshots")
      .insert({
        product_id: productId,
        erp_connection_id: conn.id,
        erp_bom_id: String(bom.id),
        erp_bom_revision: bom.code ? String(bom.code) : null,
        raw_payload: { bom, lines },
        normalized_items: normalized,
        content_hash: hash,
        captured_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (sErr && !String(sErr.message).includes("duplicate")) throw sErr;

    return {
      ok: true,
      found: true,
      productId,
      snapshotId: snapIns?.id,
      lineCount: normalized.length,
      sku,
    };
  } catch (error) {
    return { ok: false, found: false, sku, error: (error as Error).message };
  }
}