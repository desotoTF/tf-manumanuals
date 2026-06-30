// Product + sync-status read helpers.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
//   2. Odoo product.product.default_code (variant level).
//   3. Odoo product.template.default_code → if the template has a single
//      variant, return it; if it has multiple, return them all so the UI
//      can show a variant picker.
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
      const sku = data.sku.trim();

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

        // 2a) Variant-level exact match.
        const variantHits = await odooExecuteKw<
          Array<{
            id: number;
            default_code: string | false;
            name: string;
            product_tmpl_id: [number, string] | false;
          }>
        >(creds, uid, "product.product", "search_read", [
          [["default_code", "=", sku]],
        ], {
          fields: ["id", "default_code", "name", "product_tmpl_id"],
          limit: 1,
        });
        if (variantHits && variantHits.length > 0) {
          const row = variantHits[0];
          const tmpl = Array.isArray(row.product_tmpl_id)
            ? row.product_tmpl_id
            : null;
          return {
            source: "odoo",
            sku,
            name: row.name,
            odooProductId: String(row.id),
            odooTemplateId: tmpl ? String(tmpl[0]) : undefined,
            templateSku: sku,
            erpConnectionId: conn.id,
          };
        }

        // 2b) Template-level fallback: customer typed the base SKU
        // (e.g. TF300601) without the variant suffix (TF300601-CC).
        const tmplHits = await odooExecuteKw<
          Array<{ id: number; default_code: string | false; name: string }>
        >(creds, uid, "product.template", "search_read", [
          [["default_code", "=", sku]],
        ], { fields: ["id", "default_code", "name"], limit: 1 });

        if (tmplHits && tmplHits.length > 0) {
          const tmpl = tmplHits[0];
          const variants = await odooExecuteKw<
            Array<{ id: number; default_code: string | false; name: string }>
          >(creds, uid, "product.product", "search_read", [
            [["product_tmpl_id", "=", tmpl.id]],
          ], { fields: ["id", "default_code", "name"], limit: 50 });

          if (variants.length === 1) {
            const v = variants[0];
            return {
              source: "odoo",
              sku: v.default_code ? String(v.default_code) : sku,
              name: v.name,
              odooProductId: String(v.id),
              odooTemplateId: String(tmpl.id),
              templateSku: sku,
              erpConnectionId: conn.id,
            };
          }
          if (variants.length > 1) {
            return {
              source: "odoo_variants",
              sku,
              name: tmpl.name,
              odooTemplateId: String(tmpl.id),
              templateSku: sku,
              erpConnectionId: conn.id,
              variants: variants.map((v) => ({
                odooProductId: String(v.id),
                sku: v.default_code ? String(v.default_code) : `${sku}?`,
                name: v.name,
              })),
            };
          }
          // Template existed with zero variants — treat as single.
          return {
            source: "odoo",
            sku,
            name: tmpl.name,
            odooTemplateId: String(tmpl.id),
            templateSku: sku,
            erpConnectionId: conn.id,
          };
        }

        // 2c) Loose/prefix fallback: user typed a partial base SKU
        // (e.g. "TF3006") — search template default_code by prefix and
        // gather all variants across matches so the UI can show a picker.
        if (sku.length >= 3) {
          const tmplPrefixHits = await odooExecuteKw<
            Array<{ id: number; default_code: string | false; name: string }>
          >(creds, uid, "product.template", "search_read", [
            [["default_code", "=ilike", `${sku}%`]],
          ], { fields: ["id", "default_code", "name"], limit: 20 });

          if (tmplPrefixHits && tmplPrefixHits.length > 0) {
            type FlatVariant = {
              odooProductId: string;
              sku: string;
              name: string;
              templateId: string;
              templateSku: string;
            };
            const allVariants: FlatVariant[] = [];
            for (const tmpl of tmplPrefixHits) {
              const tmplSku = tmpl.default_code
                ? String(tmpl.default_code)
                : `tmpl-${tmpl.id}`;
              const variants = await odooExecuteKw<
                Array<{ id: number; default_code: string | false; name: string }>
              >(creds, uid, "product.product", "search_read", [
                [["product_tmpl_id", "=", tmpl.id]],
              ], { fields: ["id", "default_code", "name"], limit: 50 });
              for (const v of variants) {
                allVariants.push({
                  odooProductId: String(v.id),
                  sku: v.default_code ? String(v.default_code) : tmplSku,
                  name: v.name,
                  templateId: String(tmpl.id),
                  templateSku: tmplSku,
                });
              }
            }
            if (allVariants.length === 0) {
              return { source: "not_found", sku, name: "" };
            }
            return {
              source: "odoo_variants",
              sku,
              name: tmplPrefixHits[0].name,
              odooTemplateId: String(tmplPrefixHits[0].id),
              templateSku: tmplPrefixHits[0].default_code
                ? String(tmplPrefixHits[0].default_code)
                : sku,
              erpConnectionId: conn.id,
              variants: allVariants.map((v) => ({
                odooProductId: v.odooProductId,
                sku: v.sku,
                name: v.name,
              })),
              // Per-variant templateSku so the client can link the local
              // product row to the template-level BOM.
              variantTemplateSkus: Object.fromEntries(
                allVariants.map((v) => [v.odooProductId, v.templateSku]),
              ),
            } as never;
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
