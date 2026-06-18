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
