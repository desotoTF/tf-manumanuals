// ERP-connection stubs for Phase I. Real Odoo validation + sync lands in Phase II.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listErpConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("erp_connections")
      .select(
        "id, name, provider, base_url, database, username, is_active, last_sync_at, last_sync_status, credentials_version, created_at",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

// Placeholders — implemented in Phase II
export const validateConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        baseUrl: z.string().url(),
        database: z.string().min(1),
        username: z.string().min(1),
        apiKey: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async () => {
    // TODO Phase II: hand-rolled XML-RPC call to <baseUrl>/xmlrpc/2/common authenticate.
    throw new Error("Phase II: Odoo validation not yet implemented");
  });
