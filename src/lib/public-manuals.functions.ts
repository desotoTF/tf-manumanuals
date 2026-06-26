// Public SSR data loader for /manuals/$slug. Bypasses RLS via the service-role
// admin client but only ever returns rows where the manual version is published.
// Used by the public route loader. No auth required.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ManualContent } from "@/lib/types";

export const getPublishedManualBySlug = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: product, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id, sku, name, description, web_slug")
      .eq("web_slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!product) return { product: null, manual: null, version: null, assets: [] };

    const { data: manualRow } = await supabaseAdmin
      .from("manuals")
      .select("id, title, template_id")
      .eq("product_id", product.id)
      .eq("lifecycle", "active")
      .limit(1)
      .maybeSingle();
    if (!manualRow)
      return { product, manual: null, version: null, assets: [], layout: "classic" as const };

    let layout: "classic" | "compact" | "field_guide" | "service_card" =
      "classic";
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
        "id, version_number, content, published_at, change_summary, pdf_url",
      )
      .eq("manual_id", manualRow.id)
      .eq("state", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!version)
      return { product, manual: manualRow, version: null, assets: [], layout };

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
    };
  });
