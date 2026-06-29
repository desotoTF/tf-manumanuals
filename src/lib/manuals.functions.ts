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

export interface ManualListRow {
  manual_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  manual_title: string;
  created_at: string;
  latest_version_number: number | null;
  latest_version_state: string | null;
  last_published_at: string | null;
  last_bom_change_at: string | null;
  sync_status: string;
}

// Manuals list for the org, joined with product (SKU/name), latest version,
// and sync status. Powers the new "Manuals" page.
export const listManualsWithStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => d)
  .handler(async ({ data, context }): Promise<ManualListRow[]> => {
    const { supabase } = context;
    const { data: manuals, error } = await supabase
      .from("manuals")
      .select(
        `id, title, product_id, created_at,
         products!inner(id, sku, name, organization_id),
         manual_versions(version_number, state, published_at)`,
      )
      .eq("products.organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const productIds = (manuals ?? []).map((m: any) => m.product_id);
    const { data: statuses } = productIds.length
      ? await supabase
          .from("manual_sync_status")
          .select("product_id, status, last_bom_change_at, last_manual_publish_at")
          .in("product_id", productIds)
      : { data: [] as any[] };
    const statusByProduct = new Map(
      (statuses ?? []).map((s: any) => [s.product_id, s]),
    );

    const rows: ManualListRow[] = (manuals ?? []).map((m: any) => {
      const versions = (m.manual_versions ?? []) as {
        version_number: number;
        state: string;
        published_at: string | null;
      }[];
      const latest = versions
        .slice()
        .sort((a, b) => b.version_number - a.version_number)[0];
      const status = statusByProduct.get(m.product_id);
      return {
        manual_id: m.id,
        product_id: m.product_id,
        sku: m.products.sku,
        product_name: m.products.name,
        manual_title: m.title,
        created_at: m.created_at,
        latest_version_number: latest?.version_number ?? null,
        latest_version_state: latest?.state ?? null,
        last_published_at: status?.last_manual_publish_at ?? null,
        last_bom_change_at: status?.last_bom_change_at ?? null,
        sync_status: status?.status ?? "no_manual",
      };
    });

    return rows;
  });

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
        templateId: uuid.optional(),
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

    // Resolve template (explicit, or org default) when creating a new manual.
    let resolvedTemplateId: string | null = null;
    if (!manualId) {
      if (data.templateId) {
        resolvedTemplateId = data.templateId;
      } else {
        const { data: defTpl } = await supabase
          .from("manual_templates" as never)
          .select("id")
          .eq("organization_id", product.organization_id)
          .eq("is_default", true)
          .maybeSingle();
        resolvedTemplateId = (defTpl as { id: string } | null)?.id ?? null;
      }
      if (resolvedTemplateId) {
        const { data: tpl } = await supabase
          .from("manual_templates" as never)
          .select("default_content")
          .eq("id", resolvedTemplateId)
          .maybeSingle();
        const tplContent = (tpl as { default_content: unknown } | null)
          ?.default_content;
        if (tplContent && typeof tplContent === "object") {
          seedContent = {
            ...emptyManualContent(),
            ...(tplContent as object),
          } as ManualContent;
        }
      }
    }

    if (!manualId) {
      const { data: newManual, error: mErr } = await supabase
        .from("manuals")
        .insert({
          product_id: product.id,
          title: data.title ?? `${product.name} — Installation Manual`,
          created_by: userId,
          ...(resolvedTemplateId ? { template_id: resolvedTemplateId } : {}),
        } as never)
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

    // If seeding a new manual AND template didn't already supply parts, pre-fill from BOM.
    if (
      !data.manualId &&
      latestBom?.normalized_items &&
      seedContent.parts.length === 0
    ) {
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


// SKU-first manual creation. Silently upserts the product (keyed by
// organization_id+sku) so Manuals are decoupled from picking from a list,
// then reuses createManualDraft's logic to scaffold v1 with the chosen
// template.
export const createManualFromSku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: uuid,
        sku: z.string().trim().min(1).max(120),
        name: z.string().trim().min(1).max(200),
        odooProductId: z.string().optional(),
        erpConnectionId: uuid.optional(),
        templateId: uuid.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const sku = data.sku.trim();
    const name = data.name.trim();
    const slugBase =
      sku.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
      `sku-${Date.now()}`;

    // Upsert product on (organization_id, sku).
    const { data: prod, error: pErr } = await supabase
      .from("products")
      .upsert(
        {
          organization_id: data.organizationId,
          sku,
          name,
          is_active: true,
          web_slug: slugBase,
          ...(data.erpConnectionId
            ? { erp_connection_id: data.erpConnectionId }
            : {}),
          ...(data.odooProductId
            ? { erp_product_id: data.odooProductId }
            : {}),
        },
        { onConflict: "organization_id,sku" },
      )
      .select("id")
      .single();
    let productId: string;
    if (pErr) {
      // Slug collision fallback: append a short suffix.
      const { data: prod2, error: pErr2 } = await supabase
        .from("products")
        .upsert(
          {
            organization_id: data.organizationId,
            sku,
            name,
            is_active: true,
            web_slug: `${slugBase}-${Date.now().toString(36).slice(-4)}`,
            ...(data.erpConnectionId
              ? { erp_connection_id: data.erpConnectionId }
              : {}),
            ...(data.odooProductId
              ? { erp_product_id: data.odooProductId }
              : {}),
          },
          { onConflict: "organization_id,sku" },
        )
        .select("id")
        .single();
      if (pErr2) throw pErr2;
      productId = prod2.id;
    } else {
      productId = prod.id;
    }


    // Reject if a manual already exists for this product — the UI should
    // route the user to the existing manual instead.
    const { data: existing } = await supabase
      .from("manuals")
      .select("id")
      .eq("product_id", productId)
      .maybeSingle();
    if (existing) {
      return { productId, manualId: existing.id, alreadyExisted: true };
    }

    // Resolve template (explicit or org default).
    let resolvedTemplateId: string | null = data.templateId ?? null;
    let seedContent: ManualContent = emptyManualContent();
    if (!resolvedTemplateId) {
      const { data: defTpl } = await supabase
        .from("manual_templates" as never)
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("is_default", true)
        .maybeSingle();
      resolvedTemplateId = (defTpl as { id: string } | null)?.id ?? null;
    }
    if (resolvedTemplateId) {
      const { data: tpl } = await supabase
        .from("manual_templates" as never)
        .select("default_content")
        .eq("id", resolvedTemplateId)
        .maybeSingle();
      const tplContent = (tpl as { default_content: unknown } | null)
        ?.default_content;
      if (tplContent && typeof tplContent === "object") {
        seedContent = {
          ...emptyManualContent(),
          ...(tplContent as object),
        } as ManualContent;
      }
    }

    const { data: newManual, error: mErr } = await supabase
      .from("manuals")
      .insert({
        product_id: productId,
        title: `${sku} | ${name}`,
        created_by: userId,
        ...(resolvedTemplateId ? { template_id: resolvedTemplateId } : {}),
      } as never)
      .select("id")
      .single();
    if (mErr) throw mErr;

    const { data: latestBom } = await supabase
      .from("bom_snapshots")
      .select("id, normalized_items")
      .eq("product_id", productId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestBom?.normalized_items && seedContent.parts.length === 0) {
      const items = (latestBom.normalized_items as Array<Record<string, unknown>>) ?? [];
      seedContent.parts = items.map((it) => ({
        part_number: String(it.part_number ?? ""),
        qty: Number(it.qty ?? 1),
        description: it.description as string | undefined,
        notes: it.notes as string | undefined,
      }));
    }

    const { data: nextNum } = await supabase.rpc(
      "next_manual_version_number",
      { _manual_id: newManual.id },
    );
    const { data: version, error: vErr } = await supabase
      .from("manual_versions")
      .insert({
        manual_id: newManual.id,
        version_number: nextNum ?? 1,
        bom_snapshot_id: latestBom?.id ?? null,
        state: "draft",
        content: seedContent as never,
        created_by: userId,
      })
      .select("id")
      .single();
    if (vErr) throw vErr;

    return {
      productId,
      manualId: newManual.id,
      versionId: version.id,
      alreadyExisted: false,
    };
  });



// ---------- Legacy PDF import ----------
// Accepts a base64-encoded PDF, uploads it to storage, asks Lovable AI to
// extract structured manual content, and creates a new draft manual version
// pre-filled with that content. The new manual is tagged source='imported_pdf'.
export const importLegacyManualFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        productId: uuid,
        templateId: uuid.optional(),
        filename: z.string().min(1).max(255),
        // base64-encoded PDF bytes (no data: prefix)
        pdfBase64: z.string().min(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, name, organization_id")
      .eq("id", data.productId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!product) throw new Error("Product not found");

    // Size guard: 20MB raw
    const pdfBytes = Buffer.from(data.pdfBase64, "base64");
    if (pdfBytes.byteLength > 20 * 1024 * 1024)
      throw new Error("PDF too large (max 20MB)");

    // 1. Upload PDF via admin client (storage policies separately allow
    //    auth uploads, but admin avoids surprise RLS failures).
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `legacy-pdfs/${product.organization_id}/${product.id}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("manual-assets")
      .upload(path, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) throw new Error(`PDF upload failed: ${upErr.message}`);

    // 2. Ask Lovable AI to extract structured content from the PDF.
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey)
      throw new Error("LOVABLE_API_KEY not configured on the server.");
    const dataUri = `data:application/pdf;base64,${data.pdfBase64}`;
    const systemPrompt =
      "You extract installation/service manual content from a PDF into a strict JSON schema. " +
      "Output ONLY valid JSON. Schema keys: tools (array of {name, spec}), parts (array of " +
      "{part_number, qty, description?, notes?}), steps (array of {id, title, body}), warnings " +
      "(array of {severity: 'info'|'caution'|'danger', body}), torque_specs (array of " +
      "{fastener, value, unit, sequence?}). Use empty arrays when a section is missing. " +
      "Generate stable step ids like 'step-1','step-2'. Do not invent values.";
    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Extract the installation manual content for product "${product.name}".`,
                },
                {
                  type: "file",
                  file: { filename: safeName, file_data: dataUri },
                },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(
        `AI extraction failed (${aiRes.status}): ${errText.slice(0, 500)}`,
      );
    }
    const aiJson = (await aiRes.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = aiJson.choices?.[0]?.message?.content ?? "{}";
    let extracted: Partial<ManualContent> = {};
    try {
      extracted = JSON.parse(raw);
    } catch {
      // Sometimes the model wraps JSON in code fences.
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) extracted = JSON.parse(m[0]);
    }

    // 3. Resolve template (explicit or org default).
    let templateId = data.templateId ?? null;
    let templateContent: Partial<ManualContent> = {};
    if (!templateId) {
      const { data: defTpl } = await supabase
        .from("manual_templates" as never)
        .select("id, default_content")
        .eq("organization_id", product.organization_id)
        .eq("is_default", true)
        .maybeSingle();
      const t = defTpl as
        | { id: string; default_content: unknown }
        | null;
      if (t) {
        templateId = t.id;
        templateContent =
          (t.default_content as Partial<ManualContent>) ?? {};
      }
    } else {
      const { data: tpl } = await supabase
        .from("manual_templates" as never)
        .select("default_content")
        .eq("id", templateId)
        .maybeSingle();
      templateContent =
        ((tpl as { default_content?: Partial<ManualContent> } | null)
          ?.default_content as Partial<ManualContent>) ?? {};
    }

    // Merge template defaults <- AI-extracted (AI wins on conflicts).
    const merged: ManualContent = {
      ...emptyManualContent(),
      ...templateContent,
      ...extracted,
    } as ManualContent;
    // Sanity: ensure arrays
    merged.tools = Array.isArray(merged.tools) ? merged.tools : [];
    merged.parts = Array.isArray(merged.parts) ? merged.parts : [];
    merged.steps = Array.isArray(merged.steps) ? merged.steps : [];
    merged.warnings = Array.isArray(merged.warnings) ? merged.warnings : [];
    merged.torque_specs = Array.isArray(merged.torque_specs)
      ? merged.torque_specs
      : [];
    merged.images = Array.isArray(merged.images) ? merged.images : [];

    // 4. Create manual + draft version pointing at the latest BOM.
    const { data: latestBom } = await supabase
      .from("bom_snapshots")
      .select("id")
      .eq("product_id", product.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: newManual, error: mErr } = await supabase
      .from("manuals")
      .insert({
        product_id: product.id,
        title: `${product.name} — Imported manual`,
        created_by: userId,
        ...(templateId ? { template_id: templateId } : {}),
        source: "imported_pdf",
      } as never)
      .select("id")
      .single();
    if (mErr) throw mErr;

    const { data: nextNum } = await supabase.rpc(
      "next_manual_version_number",
      { _manual_id: newManual.id },
    );

    const { data: version, error: vErr } = await supabase
      .from("manual_versions")
      .insert({
        manual_id: newManual.id,
        version_number: nextNum ?? 1,
        bom_snapshot_id: latestBom?.id ?? null,
        state: "draft",
        content: merged as never,
        change_summary: `Imported from ${data.filename}`,
        created_by: userId,
        source_pdf_path: path,
      } as never)
      .select("id")
      .single();
    if (vErr) throw vErr;

    return {
      manualId: newManual.id,
      versionId: version.id,
      pdfStoragePath: path,
    };
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

// Upload an image file (base64-encoded) to the manual-assets bucket and
// attach it to the version. The bucket is private, so we mint a long-lived
// signed URL and store it on the asset row alongside the storage_path so
// public/auth readers can render without additional signing.
export const uploadManualAssetFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        versionId: uuid,
        filename: z.string().min(1).max(200),
        contentType: z.string().min(1).max(120),
        // base64 (no data: prefix). Cap at ~12MB encoded.
        dataBase64: z.string().min(1).max(16_000_000),
        caption: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Resolve org for namespacing via the version → manual → product chain.
    const { data: version, error: vErr } = await supabase
      .from("manual_versions")
      .select("id, manual_id, manuals!inner(product_id, products!inner(organization_id))")
      .eq("id", data.versionId)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!version) throw new Error("Version not found");
    const nested = version as unknown as {
      manuals: { product_id: string; products: { organization_id: string } };
    };
    const orgId = nested.manuals.products.organization_id;
    const productId = nested.manuals.product_id;

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `manual-images/${orgId}/${productId}/${data.versionId}/${Date.now()}-${safeName}`;
    const bytes = Buffer.from(data.dataBase64, "base64");

    const { error: upErr } = await supabaseAdmin.storage
      .from("manual-assets")
      .upload(path, bytes, {
        contentType: data.contentType,
        upsert: false,
      });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    // 10-year signed URL. Private bucket workaround until public buckets are
    // enabled at the workspace level.
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("manual-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (sErr) throw new Error(`Signing URL failed: ${sErr.message}`);

    const { data: asset, error } = await supabase
      .from("manual_assets")
      .insert({
        manual_version_id: data.versionId,
        type: "image",
        storage_path: path,
        url: signed.signedUrl,
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

// ---------- BOM autofill for the manual editor ----------
// Loads the latest BOM snapshot for the product, applies the org's
// exclusion list, and splits lines into:
//   - hardware_kit: lines from the child product whose sku == `${product.sku}.x`
//   - parts:         everything else
// Lines whose part_number ends in `.x` are treated as hardware-kit markers and
// never appear in the parts list (their child BOM is fetched instead).
export const loadBomForManual = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { isExcluded } = await import("@/lib/bom-exclusions.functions");

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, sku, organization_id")
      .eq("id", data.productId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!product) throw new Error("Product not found");

    const { data: bom } = await supabase
      .from("bom_snapshots")
      .select("normalized_items, captured_at")
      .eq("product_id", data.productId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!bom) {
      return {
        parts: [],
        hardware_kit: [],
        excluded: [] as string[],
        hardwareSku: null as string | null,
        hardwareBomMissing: false,
        bomCapturedAt: null as string | null,
      };
    }

    const { data: rules } = await supabase
      .from("bom_exclusions")
      .select("pattern, match_type")
      .eq("organization_id", product.organization_id);
    const exclusionRules = rules ?? [];

    const items = (bom.normalized_items as unknown as Array<{
      part_number: string;
      qty: number;
      description?: string;
      unit?: string;
      notes?: string;
    }>) ?? [];

    const excluded: string[] = [];
    const parts: typeof items = [];
    const hardwareMarkers: typeof items = [];

    for (const it of items) {
      const pn = String(it.part_number ?? "");
      if (isExcluded(pn, exclusionRules)) {
        excluded.push(pn);
        continue;
      }
      if (pn.toLowerCase().endsWith(".x")) {
        hardwareMarkers.push(it);
        continue;
      }
      parts.push(it);
    }

    // Hardware kit = BOM of the `.x` child product. Prefer the one matching
    // `${parent_sku}.x`; otherwise just take the first marker.
    const expectedHardwareSku = `${product.sku}.x`;
    const hardwareMarker =
      hardwareMarkers.find(
        (m) => m.part_number.toLowerCase() === expectedHardwareSku.toLowerCase(),
      ) ?? hardwareMarkers[0] ?? null;

    let hardware_kit: typeof items = [];
    let hardwareBomMissing = false;
    if (hardwareMarker) {
      const { data: childProduct } = await supabase
        .from("products")
        .select("id")
        .eq("organization_id", product.organization_id)
        .ilike("sku", hardwareMarker.part_number)
        .maybeSingle();
      if (childProduct) {
        const { data: childBom } = await supabase
          .from("bom_snapshots")
          .select("normalized_items")
          .eq("product_id", childProduct.id)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (childBom) {
          const childItems =
            (childBom.normalized_items as unknown as typeof items) ?? [];
          hardware_kit = childItems.filter((it) => {
            const pn = String(it.part_number ?? "");
            if (isExcluded(pn, exclusionRules)) {
              excluded.push(pn);
              return false;
            }
            return true;
          });
        } else {
          hardwareBomMissing = true;
        }
      } else {
        hardwareBomMissing = true;
      }
    }

    return {
      parts: parts.map((it) => ({
        part_number: it.part_number,
        qty: Number(it.qty ?? 1),
        description: it.description,
        notes: it.notes,
      })),
      hardware_kit: hardware_kit.map((it) => ({
        part_number: it.part_number,
        qty: Number(it.qty ?? 1),
        description: it.description,
        notes: it.notes,
      })),
      excluded,
      hardwareSku: hardwareMarker?.part_number ?? null,
      hardwareBomMissing,
      bomCapturedAt: bom.captured_at,
    };
  });

