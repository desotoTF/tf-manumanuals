// Public SSR data loader for /manuals/$slug and /m/$orgSlug/$slug. Bypasses RLS
// via the service-role admin client but only ever returns rows where the manual
// version is published. No auth required.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ManualContent } from "@/lib/types";

export const getPublishedManualBySlug = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        slug: z.string().min(1).max(200),
        orgSlug: z.string().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const empty = {
      product: null,
      manual: null,
      version: null,
      assets: [],
      layout: "classic" as const,
      org: null as { id: string; name: string; slug: string } | null,
    };

    let org: { id: string; name: string; slug: string } | null = null;
    if (data.orgSlug) {
      const { data: orgRow } = await supabaseAdmin
        .from("organizations")
        .select("id, name, slug")
        .eq("slug", data.orgSlug)
        .maybeSingle();
      if (!orgRow) return empty;
      org = orgRow;
    }

    let productQuery = supabaseAdmin
      .from("products")
      .select("id, sku, name, description, web_slug, organization_id")
      .eq("web_slug", data.slug)
      .eq("is_active", true);
    if (org) productQuery = productQuery.eq("organization_id", org.id);

    const { data: product, error: pErr } = await productQuery.maybeSingle();
    if (pErr) throw pErr;
    if (!product) return empty;

    if (!org) {
      const { data: orgRow } = await supabaseAdmin
        .from("organizations")
        .select("id, name, slug")
        .eq("id", product.organization_id)
        .maybeSingle();
      org = orgRow ?? null;
    }

    const { data: manualRow } = await supabaseAdmin
      .from("manuals")
      .select("id, title, template_id, visibility")
      .eq("product_id", product.id)
      .eq("lifecycle", "active")
      .limit(1)
      .maybeSingle();
    // Private manuals are never served on public routes.
    if (manualRow && (manualRow as { visibility?: string }).visibility === "private")
      return { ...empty, org };
    if (!manualRow)
      return { product, manual: null, version: null, assets: [], layout: "classic" as const, org };

    let layout: "classic" | "compact" | "field_guide" | "service_card" = "classic";
    const tplId = (manualRow as { template_id?: string | null }).template_id;
    if (tplId) {
      const { data: tpl } = await supabaseAdmin
        .from("manual_templates" as never)
        .select("layout")
        .eq("id", tplId)
        .maybeSingle();
      const tplLayout = (tpl as { layout?: typeof layout } | null)?.layout;
      if (tplLayout) layout = tplLayout;
    }

    const { data: version } = await supabaseAdmin
      .from("manual_versions")
      .select(
        "id, version_number, content, published_at, change_summary, pdf_url, published_pdf_url",
      )
      .eq("manual_id", manualRow.id)
      .eq("state", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!version) return { product, manual: manualRow, version: null, assets: [], layout, org };

    const { data: assets } = await supabaseAdmin
      .from("manual_assets")
      .select("id, type, url, metadata")
      .eq("manual_version_id", version.id);

    return {
      product,
      manual: manualRow,
      version: {
        ...version,
        content: (version.content ?? {}) as Partial<ManualContent>,
      },
      assets: assets ?? [],
      layout,
      org,
    };
  });
