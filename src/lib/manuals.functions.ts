// Manual editor server functions: load product+manual+version, create/save drafts,
// transition states, attach asset URLs. State transition policy:
//   draft -> in_review -> approved -> published -> superseded (auto via DB trigger)
//   draft can be discarded (deleted) by any editor.
//   approve/publish requires owner|admin (not just editor).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { emptyManualContent, type ManualContent } from "@/lib/types";

const uuid = z.string().uuid();

export const getProductWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select(
        "id, sku, name, description, web_slug, organization_id, is_active",
      )
      .eq("id", data.productId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!product) throw new Error("Product not found");

    const { data: latestBom } = await supabase
      .from("bom_snapshots")
      .select("id, captured_at, normalized_items, content_hash, erp_bom_revision")
      .eq("product_id", data.productId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: status } = await supabase
      .from("manual_sync_status")
      .select("*")
      .eq("product_id", data.productId)
      .maybeSingle();

    const { data: manuals } = await supabase
      .from("manuals")
      .select("id, title, lifecycle, created_at, updated_at")
      .eq("product_id", data.productId)
      .order("created_at", { ascending: true });

    const manualIds = (manuals ?? []).map((m) => m.id);
    const { data: versions } = manualIds.length
      ? await supabase
          .from("manual_versions")
          .select(
            "id, manual_id, version_number, state, change_summary, bom_snapshot_id, published_at, created_at, updated_at",
          )
          .in("manual_id", manualIds)
          .order("version_number", { ascending: false })
      : { data: [] as any[] };

    return {
      product,
      latestBom,
      status,
      manuals: manuals ?? [],
      versions: versions ?? [],
    };
  });

export const getManualVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ versionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: version, error } = await supabase
      .from("manual_versions")
      .select(
        "id, manual_id, version_number, state, content, change_summary, bom_snapshot_id, pdf_url, published_at, created_at, updated_at, created_by, approved_by",
      )
      .eq("id", data.versionId)
      .maybeSingle();
    if (error) throw error;
    if (!version) throw new Error("Version not found");

    const { data: assets } = await supabase
      .from("manual_assets")
      .select("id, type, storage_path, url, metadata, created_at")
      .eq("manual_version_id", data.versionId)
      .order("created_at", { ascending: true });

    return { version, assets: assets ?? [] };
  });

// Create a new manual (with a v1 draft) for a product, OR a new draft version
// of an existing manual. If `manualId` is provided we add v(N+1) draft cloned
// from the latest version's content. If not, we create a new manual + v1.
export const createManualDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        productId: uuid,
        manualId: uuid.optional(),
        title: z.string().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve product (and org for the title default).
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, name, organization_id")
      .eq("id", data.productId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!product) throw new Error("Product not found");

    let manualId = data.manualId;
    let seedContent: ManualContent = emptyManualContent();

    if (!manualId) {
      const { data: newManual, error: mErr } = await supabase
        .from("manuals")
        .insert({
          product_id: product.id,
          title: data.title ?? `${product.name} — Installation Manual`,
          created_by: userId,
        })
        .select("id")
        .single();
      if (mErr) throw mErr;
      manualId = newManual.id;
    } else {
      // Clone latest version's content as the new draft starting point.
      const { data: latest } = await supabase
        .from("manual_versions")
        .select("content")
        .eq("manual_id", manualId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest?.content)
        seedContent = { ...emptyManualContent(), ...(latest.content as object) } as ManualContent;
    }

    // Latest BOM snapshot to tie the draft to.
    const { data: latestBom } = await supabase
      .from("bom_snapshots")
      .select("id, normalized_items")
      .eq("product_id", product.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // If seeding a new manual, pre-fill parts from the BOM.
    if (!data.manualId && latestBom?.normalized_items) {
      const items = (latestBom.normalized_items as any[]) ?? [];
      seedContent.parts = items.map((it) => ({
        part_number: String(it.part_number ?? ""),
        qty: Number(it.qty ?? 1),
        description: it.description,
        notes: it.notes,
      }));
    }

    const { data: nextNum, error: nErr } = await supabase.rpc(
      "next_manual_version_number",
      { _manual_id: manualId },
    );
    if (nErr) throw nErr;

    const { data: version, error: vErr } = await supabase
      .from("manual_versions")
      .insert({
        manual_id: manualId,
        version_number: nextNum ?? 1,
        bom_snapshot_id: latestBom?.id ?? null,
        state: "draft",
        content: seedContent as never,
        created_by: userId,
      })
      .select("id")
      .single();
    if (vErr) throw vErr;

    return { manualId, versionId: version.id };
  });

export const saveDraftContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        versionId: uuid,
        content: z.record(z.string(), z.unknown()),
        changeSummary: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing, error: eErr } = await supabase
      .from("manual_versions")
      .select("state")
      .eq("id", data.versionId)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!existing) throw new Error("Version not found");
    if (existing.state !== "draft" && existing.state !== "in_review")
      throw new Error(`Cannot edit a version in '${existing.state}' state`);

    const { error } = await supabase
      .from("manual_versions")
      .update({
        content: data.content as never,
        change_summary: data.changeSummary ?? null,
      })
      .eq("id", data.versionId);
    if (error) throw error;
    return { ok: true as const };
  });

export const transitionManualVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        versionId: uuid,
        action: z.enum(["submit", "approve", "publish", "discard"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: version, error: vErr } = await supabase
      .from("manual_versions")
      .select(
        "id, state, manual_id, manuals:manuals(product_id, products:products(organization_id))",
      )
      .eq("id", data.versionId)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!version) throw new Error("Version not found");

    const orgId = (version as any).manuals?.products?.organization_id as
      | string
      | undefined;
    if (!orgId) throw new Error("Could not resolve organization");

    // approve/publish require admin or owner. submit/discard ok for editor.
    if (data.action === "approve" || data.action === "publish") {
      const { data: ok } = await supabase.rpc("has_org_any_role", {
        _org_id: orgId,
        _roles: ["owner", "admin"],
      });
      if (!ok) {
        const { data: isSuper } = await supabase.rpc("is_super_admin");
        if (!isSuper)
          throw new Error("Only owners or admins can approve or publish");
      }
    }

    const current = version.state;
    let next: string | null = null;
    if (data.action === "submit") {
      if (current !== "draft") throw new Error("Only drafts can be submitted");
      next = "in_review";
    } else if (data.action === "approve") {
      if (current !== "in_review")
        throw new Error("Only in-review versions can be approved");
      next = "approved";
    } else if (data.action === "publish") {
      if (current !== "approved" && current !== "in_review")
        throw new Error("Only approved versions can be published");
      next = "published";
    } else if (data.action === "discard") {
      if (current !== "draft")
        throw new Error("Only drafts can be discarded");
      const { error } = await supabase
        .from("manual_versions")
        .delete()
        .eq("id", data.versionId);
      if (error) throw error;
      return { ok: true as const, deleted: true };
    }

    const update: Record<string, unknown> = { state: next };
    if (next === "approved") update.approved_by = userId;
    // published_at is stamped by trigger.

    const { error: uErr } = await supabase
      .from("manual_versions")
      .update(update as never)
      .eq("id", data.versionId);
    if (uErr) throw uErr;

    // Log a sync_event so it shows on the dashboard / audit.
    await supabase.from("sync_events").insert({
      organization_id: orgId,
      event_type: "manual_state_changed",
      payload: { version_id: data.versionId, from: current, to: next },
    });

    return { ok: true as const, state: next };
  });

export const addManualAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        versionId: uuid,
        type: z.enum(["image", "diagram", "video_reference"]).default("image"),
        url: z.string().url(),
        caption: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: asset, error } = await supabase
      .from("manual_assets")
      .insert({
        manual_version_id: data.versionId,
        type: data.type,
        url: data.url,
        metadata: data.caption ? { caption: data.caption } : {},
      })
      .select("id, type, url, metadata, created_at")
      .single();
    if (error) throw error;
    return asset;
  });

export const removeManualAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ assetId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("manual_assets")
      .delete()
      .eq("id", data.assetId);
    if (error) throw error;
    return { ok: true as const };
  });
