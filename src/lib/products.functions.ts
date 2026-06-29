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

// SKU-first lookup used by the Create Manual flow. Returns the local product
// row if one already exists for the SKU; otherwise tries the org's active
// Odoo connection (read-only) to auto-fill the product name. Returns
// { source: 'not_found' } when neither finds anything — the UI lets the user
// type a name anyway.
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
      source: "local" | "odoo" | "not_found";
      sku: string;
      name: string;
      productId?: string;
      odooProductId?: string;
      erpConnectionId?: string;
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
        const rows = await odooExecuteKw<
          Array<{ id: number; default_code: string | false; name: string }>
        >(creds, uid, "product.product", "search_read", [
          [["default_code", "=", sku]],
        ], { fields: ["id", "default_code", "name"], limit: 1 });
        if (rows && rows.length > 0) {
          return {
            source: "odoo",
            sku,
            name: rows[0].name,
            odooProductId: String(rows[0].id),
            erpConnectionId: conn.id,
          };
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
