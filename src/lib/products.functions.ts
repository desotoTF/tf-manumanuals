// Product + sync-status read helpers.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const extractTfBaseSku = (value: string): string | null => {
  const match = value.trim().match(/\b(TF\d{6})\b/i);
  return match ? match[1].toUpperCase() : null;
};

const normalizeLookupSku = (value: string): string =>
  extractTfBaseSku(value) ?? value.trim().toUpperCase();

const isMainTfSku = (value: string | false | null | undefined): value is string =>
  typeof value === "string" && /^TF\d{6}$/i.test(value.trim());

export const listProductsWithStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("products")
      .select(
        `
        id, sku, name, description, is_active, web_slug, erp_connection_id, created_at,
        manual_sync_status:manual_sync_status(
          status, last_bom_change_at, last_manual_publish_at, out_of_sync_since
        )
      `,
      )
      .eq("organization_id", data.organizationId)
      .order("sku");
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      ...r,
      // manual_sync_status is returned as an array because of the FK relationship.
      // Each product has at most one row (UNIQUE(product_id)).
      sync_status: Array.isArray(r.manual_sync_status)
        ? r.manual_sync_status[0]
        : r.manual_sync_status,
    }));
  });

// Products in the org that don't yet have a manual attached.
// Used by the "Create manual" picker so we don't accidentally duplicate.
export const listProductsWithoutManual = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: products, error } = await supabase
      .from("products")
      .select("id, sku, name")
      .eq("organization_id", data.organizationId)
      .eq("is_active", true)
      .order("sku");
    if (error) throw error;
    const ids = (products ?? []).map((p) => p.id);
    if (ids.length === 0) return [];
    const { data: existing } = await supabase
      .from("manuals")
      .select("product_id")
      .in("product_id", ids);
    const taken = new Set((existing ?? []).map((m) => m.product_id));
    return (products ?? []).filter((p) => !taken.has(p.id));
  });

// SKU-first lookup used by the Create Manual flow.
// Resolution order:
//   1. Local product (org-scoped, exact SKU match).
//   2. Odoo product.template.default_code (main product only).
//
// TF products must resolve to the main 6-digit SKU (TF######). Variant SKUs
// and hardware/part SKUs must never become manual SKUs.
export const lookupProductBySku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        sku: z.string().trim().min(1).max(120),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      source: "local" | "odoo" | "odoo_variants" | "not_found";
      sku: string;
      name: string;
      productId?: string;
      odooProductId?: string;
      odooTemplateId?: string;
      templateSku?: string;
      erpConnectionId?: string;
      variants?: Array<{
        odooProductId: string;
        sku: string;
        name: string;
      }>;
      variantTemplateSkus?: Record<string, string>;
      lookupError?: string;
    }> => {
      const { supabase } = context;
      const rawSku = data.sku.trim();
      const sku = normalizeLookupSku(rawSku);

      // 1) Local hit.
      const { data: local } = await supabase
        .from("products")
        .select("id, sku, name, erp_connection_id, erp_product_id")
        .eq("organization_id", data.organizationId)
        .eq("sku", sku)
        .maybeSingle();
      if (local) {
        return {
          source: "local",
          sku: local.sku,
          name: local.name,
          productId: local.id,
          odooProductId: local.erp_product_id ?? undefined,
          erpConnectionId: local.erp_connection_id ?? undefined,
        };
      }

      // 2) Try Odoo via the org's active connection.
      const { data: conn } = await supabase
        .from("erp_connections")
        .select("id, base_url, database, username, is_active")
        .eq("organization_id", data.organizationId)
        .eq("provider", "odoo")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conn) {
        return { source: "not_found", sku, name: "" };
      }

      try {
        const { data: cred, error: credErr } = await supabase.rpc(
          "erp_read_credentials",
          { _connection_id: conn.id },
        );
        if (credErr) throw credErr;
        const apiKey = (cred as { api_key?: string } | null)?.api_key;
        if (!apiKey) throw new Error("No stored credential for Odoo");

        const { odooAuthenticate, odooExecuteKw } = await import(
          "./odoo-xmlrpc.server"
        );
        const creds = {
          baseUrl: conn.base_url,
          database: conn.database ?? "",
          username: conn.username,
          apiKey,
        };
        const uid = await odooAuthenticate(creds);

        // 2a) Template-level lookup: customer may type the base SKU
        // (TF300601) or a variant/full SKU (TF300601-CC). We always resolve
        // and return the main template SKU only.
        const tmplHits = await odooExecuteKw<
          Array<{ id: number; default_code: string | false; name: string }>
        >(creds, uid, "product.template", "search_read", [
          [["default_code", "=", sku]],
        ], { fields: ["id", "default_code", "name"], limit: 1 });

        if (tmplHits && tmplHits.length > 0) {
          const tmpl = tmplHits[0];
          return {
            source: "odoo",
            sku: tmpl.default_code ? String(tmpl.default_code).toUpperCase() : sku,
            name: tmpl.name,
            odooProductId: String(tmpl.id),
            odooTemplateId: String(tmpl.id),
            templateSku: tmpl.default_code ? String(tmpl.default_code).toUpperCase() : sku,
            erpConnectionId: conn.id,
          };
        }

        // 2b) Loose/prefix fallback: search templates only. For TF SKUs,
        // keep only exact main products (TF######), excluding hardware kits,
        // variants, and part/helper SKUs such as TF######.x or TF######-CC.
        if (sku.length >= 2) {
          const tmplPrefixHits = await odooExecuteKw<
            Array<{ id: number; default_code: string | false; name: string }>
          >(creds, uid, "product.template", "search_read", [
            [["default_code", "=ilike", `${sku}%`]],
          ], { fields: ["id", "default_code", "name"], limit: 20 });

          const productHits = (tmplPrefixHits ?? [])
            .filter((tmpl) =>
              /^TF/i.test(sku) ? isMainTfSku(tmpl.default_code) : !!tmpl.default_code,
            )
            .map((tmpl) => ({
              odooProductId: String(tmpl.id),
              sku: String(tmpl.default_code).toUpperCase(),
              name: tmpl.name,
            }));

          if (productHits.length > 0) {
            if (productHits.length === 1) {
              const product = productHits[0];
              return {
                source: "odoo",
                sku: product.sku,
                name: product.name,
                odooProductId: product.odooProductId,
                odooTemplateId: product.odooProductId,
                templateSku: product.sku,
                erpConnectionId: conn.id,
              };
            }
            return {
              source: "odoo_variants",
              sku,
              name: productHits[0].name,
              odooTemplateId: productHits[0].odooProductId,
              templateSku: productHits[0].sku,
              erpConnectionId: conn.id,
              variants: productHits,
              variantTemplateSkus: Object.fromEntries(
                productHits.map((p) => [p.odooProductId, p.sku]),
              ),
            };
          }

          if (tmplPrefixHits && tmplPrefixHits.length > 0 && /^TF/i.test(sku)) {
            // We found templates, but they were not main TF products. Treat as
            // not found instead of offering parts/hardware kits as manuals.
            return { source: "not_found", sku, name: "" };
          }

          if (tmplPrefixHits && tmplPrefixHits.length > 0) {
            const productHitsFallback = tmplPrefixHits
              .filter((tmpl) => !!tmpl.default_code)
              .map((tmpl) => ({
                odooProductId: String(tmpl.id),
                sku: String(tmpl.default_code).toUpperCase(),
                name: tmpl.name,
              }));
            if (productHitsFallback.length === 0) {
              return { source: "not_found", sku, name: "" };
            }
            return {
              source: "odoo_variants",
              sku,
              name: productHitsFallback[0].name,
              odooTemplateId: productHitsFallback[0].odooProductId,
              templateSku: productHitsFallback[0].sku,
              erpConnectionId: conn.id,
              variants: productHitsFallback,
              variantTemplateSkus: Object.fromEntries(
                productHitsFallback.map((p) => [p.odooProductId, p.sku]),
              ),
            };
          }
        }

        return { source: "not_found", sku, name: "" };
      } catch (e) {
        return {
          source: "not_found",
          sku,
          name: "",
          lookupError: (e as Error).message,
        };
      }
    },
  );

export const getProductDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])

  .inputValidator((d) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", data.productId)
      .maybeSingle();
    if (error) throw error;
    if (!product) throw new Error("Not found");
    const { data: bom } = await supabase
      .from("bom_snapshots")
      .select("*")
      .eq("product_id", data.productId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: status } = await supabase
      .from("manual_sync_status")
      .select("*")
      .eq("product_id", data.productId)
      .maybeSingle();
    return { product, latestBom: bom, status };
  });
