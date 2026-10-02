import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrgUsage = {
  plan: string;
  limits: { manuals: number | null; seats: number | null; features: string[] };
  manuals: number;
  seats: number;
};

export const getOrgUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: usage, error } = await context.supabase.rpc("org_usage" as never, {
      _org_id: data.organizationId,
    } as never);
    if (error) throw error;
    const { data: sub } = await context.supabase
      .from("org_subscriptions" as never)
      .select("billing_status, billing_interval, current_period_end")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    return { ...(usage as unknown as OrgUsage), subscription: sub as { billing_status: string; billing_interval: string | null; current_period_end: string | null } | null };
  });

export const setManualVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        manualId: z.string().uuid(),
        visibility: z.enum(["public_indexed", "public_unlisted", "private"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("manuals")
      .update({ visibility: data.visibility } as never)
      .eq("id", data.manualId);
    if (error) throw error;
    return { ok: true as const };
  });

export const getManualVisibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ manualId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("manuals")
      .select("visibility" as never)
      .eq("id", data.manualId)
      .maybeSingle();
    return ((row as { visibility?: string } | null)?.visibility ?? "public_unlisted") as
      | "public_indexed"
      | "public_unlisted"
      | "private";
  });
