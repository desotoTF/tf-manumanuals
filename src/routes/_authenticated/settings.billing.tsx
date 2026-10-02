// Current plan, usage, feature access, and Stripe upgrade/manage actions.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useActiveOrg } from "@/components/AppShell";
import { getOrgUsage } from "@/lib/plans.functions";
import { createCheckoutSession, createPortalSession, getSubscriptionSchedule } from "@/lib/billing.functions";
import { FEATURE_MIN_PLAN, PLANS, type Feature } from "@/lib/plans";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Lock } from "lucide-react";

type BillingSearch = { plan?: string; billing?: string; checkout?: string };
export const Route = createFileRoute("/_authenticated/settings/billing")({
  validateSearch: (s: Record<string, unknown>): BillingSearch => ({
    plan: typeof s.plan === "string" ? s.plan : undefined,
    billing: typeof s.billing === "string" ? s.billing : undefined,
    checkout: typeof s.checkout === "string" ? s.checkout : undefined,
  }),
  component: BillingPage,
});

const FEATURES: Array<[Feature, string]> = [
  ["remove_branding", "Remove ThumperFab branding"],
  ["custom_branding", "Advanced branding"],
  ["custom_templates", "Custom templates"],
  ["pdf_import", "Existing-PDF import"],
  ["odoo", "Odoo product & BOM sync"],
  ["docsie", "Docsie video import"],
];

function BillingPage() {
  const { orgId } = useActiveOrg();
  const fetchUsage = useServerFn(getOrgUsage);
  const checkout = useServerFn(createCheckoutSession);
  const portal = useServerFn(createPortalSession);
  const search = Route.useSearch();
  // Plan picked on /pricing before sign-up (URL first, then saved selection).
  const [selected, setSelected] = useState<string | null>(search.plan ?? null);
  const [yearly, setYearly] = useState(search.billing === "annual");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("mm_pending_plan");
      if (raw && !search.plan) {
        const v = JSON.parse(raw) as { plan?: string; billing?: string };
        if (v.plan) setSelected(v.plan);
        if (v.billing === "annual") setYearly(true);
      }
      localStorage.removeItem("mm_pending_plan");
    } catch { /* ignore */ }
  }, [search.plan]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["org-usage", orgId],
    queryFn: () => fetchUsage({ data: { organizationId: orgId } }),
    enabled: !!orgId,
  });
  const fetchSchedule = useServerFn(getSubscriptionSchedule);
  const paid = !!data && ["creator", "team", "operations"].includes(data.plan);
  const scheduleQ = useQuery({
    queryKey: ["sub-schedule", orgId],
    queryFn: () => fetchSchedule({ data: { organizationId: orgId } }),
    enabled: !!orgId && paid,
  });
  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  const planName = data.plan === "legacy" ? "Legacy (unlimited)" : data.plan[0].toUpperCase() + data.plan.slice(1);
  const lim = (n: number | null) => (n == null ? "Unlimited" : n);
  const hasSub = !!data.subscription && paid;
  const cancelAt = scheduleQ.data?.cancelAt ?? null;
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const status = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("checkout") : null;

  const go = async (key: string, fn: () => Promise<{ url: string }>) => {
    setBusy(key); setErr(null);
    try { window.location.href = (await fn()).url; }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Plan & billing</h1>
        <p className="text-sm text-muted-foreground">Your current plan and what it includes.</p>
      </div>
      {status === "success" && <p className="rounded-md border border-border bg-accent p-3 text-sm">Thanks! Your plan will update within a few seconds — refresh if it hasn't yet.</p>}
      {err && <p className="rounded-md border border-destructive p-3 text-sm text-destructive">{err}</p>}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Current plan: {planName}{data.subscription?.billing_interval ? ` (${data.subscription.billing_interval}ly)` : ""}</CardTitle>
          {hasSub && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => go("portal", () => portal({ data: { organizationId: orgId } }))}>{busy === "portal" ? "Opening…" : "Manage billing"}</Button>}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
          <div>Active manuals: <strong>{data.manuals}</strong> / {lim(data.limits.manuals)}</div>
          <div>Seats: <strong>{data.seats}</strong> / {lim(data.limits.seats)}</div>
          {hasSub && cancelAt && <div>Ends: <strong>{fmt(cancelAt)}</strong> (will not renew)</div>}
          {hasSub && !cancelAt && data.subscription?.current_period_end && <div>Renews: {fmt(data.subscription.current_period_end)}</div>}
          {data.subscription?.billing_status === "past_due" && <div className="text-destructive">Payment past due — please update your card.</div>}
        </CardContent>
      </Card>
      {hasSub && cancelAt && (
        <div role="status" className="space-y-2 rounded-md border border-amber/40 bg-amber-soft p-4 text-sm text-ink">
          <p className="font-semibold">Your {planName} plan ends on {fmt(cancelAt)}</p>
          <p>You keep everything in {planName} until then. After that date, this organization moves to the Free plan (1 active manual, 1 seat).</p>
          <p>If you have more than one manual at that point, only your newest manual stays editable. Older manuals are locked from editing until you upgrade again or archive newer ones. Nothing is deleted.</p>
          <p>Changed your mind? Use <strong>Manage billing</strong> to keep your subscription.</p>
        </div>
      )}
      {(data.plan === "legacy" || data.plan === "enterprise") && (
        <p className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          This organization has a special {planName} plan, so there is nothing to purchase here.
          {selected ? " To test buying a plan, sign up with a different email — new organizations start on Free." : ""}
        </p>
      )}
      {!hasSub && data.plan !== "legacy" && data.plan !== "enterprise" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Upgrade</CardTitle>
            <div className="inline-flex rounded-md border border-border p-1 text-sm">
              <button onClick={() => setYearly(false)} className={`rounded px-3 py-1 ${!yearly ? "bg-primary text-primary-foreground" : ""}`}>Monthly</button>
              <button onClick={() => setYearly(true)} className={`rounded px-3 py-1 ${yearly ? "bg-primary text-primary-foreground" : ""}`}>Annual</button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {PLANS.filter((p) => p.key !== "free").map((p) => (
              <div key={p.key} className={`flex flex-col rounded-md border p-4 text-sm ${selected === p.key ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
                <div className="font-semibold">{p.name}{selected === p.key && <span className="ml-2 text-xs font-normal text-primary">Your selection</span>}</div>
                <div className="mt-1 text-2xl font-semibold">${yearly ? p.yearly : p.monthly}<span className="text-xs font-normal text-muted-foreground">/{yearly ? "yr" : "mo"}</span></div>
                <div className="mt-1 flex-1 text-xs text-muted-foreground">{p.manuals} · {p.seats}</div>
                <Button className="mt-3" size="sm" disabled={!!busy}
                  onClick={() => go(p.key, () => checkout({ data: { organizationId: orgId, plan: p.key as "creator", interval: yearly ? "year" : "month" } }))}>
                  {busy === p.key ? "Redirecting…" : `Choose ${p.name}`}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Feature access</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {FEATURES.map(([k, label]) => {
            const on = data.limits.features.includes(k);
            return (
              <div key={k} className="flex items-center gap-2">
                {on ? <Check className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                <span className={on ? "" : "text-muted-foreground"}>{label}</span>
                {!on && <span className="ml-auto text-xs text-muted-foreground">{FEATURE_MIN_PLAN[k]} plan</span>}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground"><a href="/pricing" className="text-primary hover:underline">Compare plans</a></p>
    </div>
  );
}
