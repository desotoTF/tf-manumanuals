// Dashboard read helpers — status tile counts for a given org.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const dashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Get all products in org and join sync status
    const { data: products, error } = await supabase
      .from("products")
      .select(
        "id, sync_status:manual_sync_status(status)",
      )
      .eq("organization_id", data.organizationId);
    if (error) throw error;

    const counts = { in_sync: 0, out_of_sync: 0, no_manual: 0, pending_review: 0 };
    (products ?? []).forEach((p) => {
      const s = Array.isArray(p.sync_status) ? p.sync_status[0] : p.sync_status;
      const k = (s?.status ?? "no_manual") as keyof typeof counts;
      counts[k] = (counts[k] ?? 0) + 1;
    });

    return {
      total: products?.length ?? 0,
      counts,
    };
  });
