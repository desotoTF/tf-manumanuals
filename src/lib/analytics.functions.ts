// Privacy-conscious analytics: counts public manual views (no IP, no cookies,
// no user identity) and exposes a master-admin feedback inbox.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

export const recordManualView = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        manualId: z.string().uuid(),
        referrer: z.string().max(500).optional(),
        source: z.string().max(30).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const ua = getRequestHeader("user-agent") ?? "";
    if (!ua || BOT_RE.test(ua)) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin
      .from("manuals")
      .select("id, visibility, lifecycle, products!inner(organization_id)")
      .eq("id", data.manualId)
      .maybeSingle();
    const row = m as
      | { visibility: string; lifecycle: string; products: { organization_id: string } }
      | null;
    if (!row || row.visibility === "private" || row.lifecycle !== "active") return { ok: false };
    let host: string | null = null;
    try {
      host = data.referrer ? new URL(data.referrer).hostname.slice(0, 200) : null;
    } catch {
      host = null;
    }
    await supabaseAdmin.from("manual_views").insert({
      manual_id: data.manualId,
      organization_id: row.products.organization_id,
      referrer_host: host,
      source: data.source === "qr" ? "qr" : null,
    });
    return { ok: true };
  });

export const getManualViewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ manualId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [all, recent, qr] = await Promise.all([
      context.supabase.from("manual_views").select("id", { count: "exact", head: true }).eq("manual_id", data.manualId),
      context.supabase.from("manual_views").select("id", { count: "exact", head: true }).eq("manual_id", data.manualId).gte("viewed_at", since),
      context.supabase.from("manual_views").select("id", { count: "exact", head: true }).eq("manual_id", data.manualId).eq("source", "qr"),
    ]);
    return { total: all.count ?? 0, last30: recent.count ?? 0, qr: qr.count ?? 0 };
  });

export const adminListFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isSa } = await context.supabase.rpc("is_super_admin");
    if (!isSa) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("feedback")
      .select("id, kind, rating, message, page, created_at, user_id, organization_id, organizations(name)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const ids = [...new Set((data ?? []).map((r) => r.user_id))];
    const { data: profs } = ids.length
      ? await context.supabase.from("profiles").select("id, email, full_name").in("id", ids)
      : { data: [] };
    const byId = new Map((profs ?? []).map((p) => [p.id, p]));
    return (data ?? []).map((r) => ({
      ...r,
      orgName: (r as { organizations?: { name?: string } | null }).organizations?.name ?? null,
      email: byId.get(r.user_id)?.email ?? null,
    }));
  });
