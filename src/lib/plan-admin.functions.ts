// Super-admin plan override (complimentary upgrades, enterprise, legacy).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLAN_KEYS = ["free", "creator", "team", "operations", "enterprise", "legacy"] as const;

async function ensureSuperAdmin(supabase: any) {
  const { data } = await supabase.rpc("is_super_admin");
  if (!data) throw new Error("Forbidden: super_admin required");
}

export const adminGetOrgPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    const { data: row } = await context.supabase
      .from("org_subscriptions" as never)
      .select("plan_key, billing_status, billing_interval, override_note, stripe_subscription_id")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    return row as {
      plan_key: string; billing_status: string; billing_interval: string | null;
      override_note: string | null; stripe_subscription_id: string | null;
    } | null;
  });

export const adminSetOrgPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organizationId: z.string().uuid(),
      plan: z.enum(PLAN_KEYS),
      note: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("org_subscriptions" as never).upsert(
      {
        organization_id: data.organizationId,
        plan_key: data.plan,
        billing_status: "active",
        override_note: data.note || `Set manually by super admin`,
      } as never,
      { onConflict: "organization_id" },
    );
    if (error) throw error;
    await supabaseAdmin.from("platform_audit").insert({
      actor_user_id: context.userId,
      action: "org.plan_override",
      target_type: "organization",
      target_id: data.organizationId,
      payload: { plan: data.plan, note: data.note ?? null } as any,
    });
    return { ok: true as const };
  });
