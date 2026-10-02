import { createFileRoute } from "@tanstack/react-router";

const STATUS: Record<string, string> = {
  active: "active", trialing: "trialing", past_due: "past_due", unpaid: "past_due",
  canceled: "canceled", incomplete: "incomplete", incomplete_expired: "canceled", paused: "canceled",
};

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const body = await request.text();
        const { verifyStripeSignature, stripe, PRICE_IDS } = await import("@/lib/stripe.server");
        if (!(await verifyStripeSignature(body, request.headers.get("stripe-signature"), secret))) {
          return new Response("Invalid signature", { status: 400 });
        }
        const event = JSON.parse(body);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const syncSubscription = async (sub: any) => {
          const orgId = sub.metadata?.organization_id;
          if (!orgId) return;
          const priceId = sub.items?.data?.[0]?.price?.id;
          const mapped = PRICE_IDS[priceId];
          const status = STATUS[sub.status] ?? "incomplete";
          const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
          const ended = event.type === "customer.subscription.deleted" || status === "canceled";
          await supabaseAdmin.from("org_subscriptions" as never).upsert({
            organization_id: orgId,
            plan_key: ended ? "free" : mapped?.plan ?? "free",
            billing_interval: ended ? null : mapped?.interval ?? null,
            billing_status: ended ? "active" : status,
            stripe_customer_id: sub.customer,
            stripe_subscription_id: ended ? null : sub.id,
            current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            grace_until: status === "past_due" ? new Date(Date.now() + 7 * 864e5).toISOString() : null,
          } as never, { onConflict: "organization_id" });
        };

        try {
          if (event.type === "checkout.session.completed" && event.data.object.subscription) {
            await syncSubscription(await stripe("GET", `/subscriptions/${event.data.object.subscription}`));
          } else if (event.type.startsWith("customer.subscription.")) {
            await syncSubscription(event.data.object);
          }
        } catch (e) {
          console.error("stripe webhook failed", e);
          return new Response("error", { status: 500 });
        }
        return new Response("ok");
      },
    },
  },
});
