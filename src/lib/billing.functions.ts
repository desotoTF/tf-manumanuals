import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOrgAdmin(supabase: any, orgId: string) {
  const { data } = await supabase.rpc("has_org_any_role", { _org_id: orgId, _roles: ["owner", "admin"] });
  if (!data) throw new Error("Only organization owners and admins can manage billing.");
}

function origin() {
  const req = getRequest();
  return req.headers.get("origin") ?? new URL(req.url).origin;
}

async function getOrCreateCustomer(orgId: string, email?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { stripe } = await import("./stripe.server");
  const { data: sub } = await supabaseAdmin.from("org_subscriptions" as never).select("stripe_customer_id").eq("organization_id", orgId).maybeSingle();
  const existing = (sub as { stripe_customer_id: string | null } | null)?.stripe_customer_id;
  if (existing) return existing;
  const { data: org } = await supabaseAdmin.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const c = await stripe("POST", "/customers", { email, name: org?.name, metadata: { organization_id: orgId } });
  await supabaseAdmin.from("org_subscriptions" as never).upsert({ organization_id: orgId, stripe_customer_id: c.id } as never, { onConflict: "organization_id" });
  return c.id as string;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organizationId: z.string().uuid(), plan: z.enum(["creator", "team", "operations"]), interval: z.enum(["month", "year"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organizationId);
    const { stripe, priceFor } = await import("./stripe.server");
    const price = priceFor(data.plan, data.interval);
    if (!price) throw new Error("Unknown plan.");
    const customer = await getOrCreateCustomer(data.organizationId, (context.claims as { email?: string }).email);
    const base = origin();
    const session = await stripe("POST", "/checkout/sessions", {
      mode: "subscription",
      customer,
      client_reference_id: data.organizationId,
      line_items: { 0: { price, quantity: 1 } },
      allow_promotion_codes: true,
      metadata: { organization_id: data.organizationId },
      subscription_data: { metadata: { organization_id: data.organizationId } },
      success_url: `${base}/settings/billing?checkout=success`,
      cancel_url: `${base}/settings/billing?checkout=canceled`,
    });
    return { url: session.url as string };
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organizationId);
    const { stripe } = await import("./stripe.server");
    const customer = await getOrCreateCustomer(data.organizationId, (context.claims as { email?: string }).email);
    const s = await stripe("POST", "/billing_portal/sessions", { customer, return_url: `${origin()}/settings/billing` });
    return { url: s.url as string };
  });

// Live cancellation status from Stripe (cancel-at-period-end isn't stored locally).
export const getSubscriptionSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_org_access", { _org_id: data.organizationId });
    if (!ok) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin.from("org_subscriptions" as never).select("stripe_subscription_id").eq("organization_id", data.organizationId).maybeSingle();
    const id = (sub as { stripe_subscription_id: string | null } | null)?.stripe_subscription_id;
    if (!id) return null;
    const { stripe } = await import("./stripe.server");
    try {
      const s = await stripe("GET", `/subscriptions/${id}`);
      const endTs = s.cancel_at ?? (s.cancel_at_period_end ? (s.current_period_end ?? s.items?.data?.[0]?.current_period_end) : null);
      return { cancelAt: endTs ? new Date(endTs * 1000).toISOString() : null };
    } catch {
      return null;
    }
  });
