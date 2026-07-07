// Phase II: real Odoo connect, validate, sync.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const orgIdSchema = z.object({ organizationId: z.string().uuid() });

export const listErpConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("erp_connections")
      .select(
        "id, name, provider, base_url, database, username, is_active, last_sync_at, last_sync_status, last_sync_error, credentials_version, vault_secret_id, created_at",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const listSyncEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sync_events")
      .select("id, event_type, payload, occurred_at, erp_connection_id, product_id")
      .eq("organization_id", data.organizationId)
      .order("occurred_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    return rows ?? [];
  });

// ---------------- Validate (no persistence) ------------------------------

const credSchema = z.object({
  baseUrl: z.string().url(),
  database: z.string().min(1),
  username: z.string().min(1),
  apiKey: z.string().min(1),
});

export const validateConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => credSchema.parse(d))
  .handler(async ({ data }) => {
    const { odooAuthenticate } = await import("./odoo-xmlrpc.server");
    try {
      const uid = await odooAuthenticate(data);
      return { ok: true as const, uid };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

// ---------------- Create / rotate / revoke -------------------------------

export const createOdooConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    credSchema.extend({
      organizationId: z.string().uuid(),
      name: z.string().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { odooAuthenticate } = await import("./odoo-xmlrpc.server");

    // 1. Validate first — never persist a bad credential.
    await odooAuthenticate({
      baseUrl: data.baseUrl,
      database: data.database,
      username: data.username,
      apiKey: data.apiKey,
    });

    // 2. Insert connection row (RLS enforces admin role via policy).
    const { data: ins, error: insErr } = await context.supabase
      .from("erp_connections")
      .insert({
        organization_id: data.organizationId,
        provider: "odoo",
        name: data.name,
        base_url: data.baseUrl.replace(/\/+$/, ""),
        database: data.database,
        username: data.username,
        secret_name: "vault", // legacy NOT NULL safety — real cred lives in vault
        is_active: true,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    // 3. Store credential in vault via SECURITY DEFINER rpc.
    const { error: secErr } = await context.supabase.rpc("erp_store_credentials", {
      _connection_id: ins.id,
      _api_key: data.apiKey,
    });
    if (secErr) {
      // Roll back row if vault store fails so we don't leave a stranded connection.
      await context.supabase.from("erp_connections").delete().eq("id", ins.id);
      throw secErr;
    }

    return { id: ins.id as string };
  });

export const rotateOdooCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      connectionId: z.string().uuid(),
      apiKey: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Load connection metadata + validate the new key against Odoo.
    const { data: conn, error } = await context.supabase
      .from("erp_connections")
      .select("base_url, database, username")
      .eq("id", data.connectionId)
      .single();
    if (error) throw error;

    const { odooAuthenticate } = await import("./odoo-xmlrpc.server");
    await odooAuthenticate({
      baseUrl: conn.base_url,
      database: conn.database ?? "",
      username: conn.username,
      apiKey: data.apiKey,
    });

    const { error: secErr } = await context.supabase.rpc("erp_store_credentials", {
      _connection_id: data.connectionId,
      _api_key: data.apiKey,
    });
    if (secErr) throw secErr;
    return { ok: true };
  });

export const revokeOdooConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ connectionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Hard delete: removes the vault secret and the connection row.
    // Related rows (bom_snapshots, sync_events, products) keep their data
    // because erp_connection_id is ON DELETE SET NULL.
    const { error } = await context.supabase.rpc("erp_hard_delete_connection", {
      _connection_id: data.connectionId,
    });
    if (error) throw error;
    return { ok: true };
  });

// ---------------- BOM sync -----------------------------------------------

type NormalizedItem = {
  part_number: string;
  qty: number;
  description: string;
  unit: string;
  notes: string;
};

export function normalizeBomLines(
  lines: Array<Record<string, unknown>>,
  variantToTemplateSku?: Map<number, string>,
): NormalizedItem[] {
  return lines
    .map((l) => {
      const productField = l.product_id;
      // Odoo many2one is [id, "name"] — pull human label out.
      let part = "";
      let desc = "";
      let variantId: number | null = null;
      if (Array.isArray(productField) && productField.length >= 2) {
        if (typeof productField[0] === "number") variantId = productField[0];
        const label = String(productField[1]);
        // "[INTERNAL_REF] Display Name" — split when present.
        const m = label.match(/^\[([^\]]+)\]\s*(.*)$/);
        if (m) {
          part = m[1];
          desc = m[2];
        } else {
          part = label;
          desc = label;
        }
      } else if (typeof productField === "string") {
        part = productField;
        desc = productField;
      }
      // Prefer template SKU when we resolved one — keeps the parts list at
      // the base SKU (TF300601) rather than the variant (TF300601-CC).
      if (variantId !== null && variantToTemplateSku?.get(variantId)) {
        part = variantToTemplateSku.get(variantId)!;
      }
      const uomField = l.product_uom_id;
      const unit =
        Array.isArray(uomField) && uomField.length >= 2 ? String(uomField[1]) : "";
      return {
        part_number: part,
        qty: Number(l.product_qty ?? 0),
        description: desc,
        unit,
        notes: "",
      };
    })
    .sort((a, b) =>
      a.part_number.localeCompare(b.part_number) ||
      a.description.localeCompare(b.description),
    );
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


export const syncBoms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ connectionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: conn, error: cErr } = await context.supabase
      .from("erp_connections")
      .select("id, organization_id, base_url, database, username")
      .eq("id", data.connectionId)
      .single();
    if (cErr) throw cErr;

    const { data: cred, error: credErr } = await context.supabase.rpc(
      "erp_read_credentials",
      { _connection_id: data.connectionId },
    );
    if (credErr) throw credErr;
    const apiKey = (cred as { api_key?: string } | null)?.api_key;
    if (!apiKey) throw new Error("Stored credential is missing api_key field");

    const creds = {
      baseUrl: conn.base_url,
      database: conn.database ?? "",
      username: conn.username,
      apiKey,
    };

    // Log start
    await context.supabase.from("sync_events").insert({
      organization_id: conn.organization_id,
      erp_connection_id: conn.id,
      event_type: "bom_sync_started",
      payload: {},
    });

    const { odooAuthenticate, odooExecuteKw } = await import("./odoo-xmlrpc.server");

    let scanned = 0;
    let changed = 0;
    let productsTouched = 0;

    try {
      const uid = await odooAuthenticate(creds);

      // 1. Pull all manufacturing BOMs, lightweight first.
      const boms = await odooExecuteKw<
        Array<{
          id: number;
          code: string | false;
          product_tmpl_id: [number, string] | false;
          product_id: [number, string] | false;
          product_qty: number;
        }>
      >(creds, uid, "mrp.bom", "search_read", [[]], {
        fields: ["id", "code", "product_tmpl_id", "product_id", "product_qty"],
        limit: 200,
      });

      for (const bom of boms) {
        scanned += 1;
        const tmpl = Array.isArray(bom.product_tmpl_id) ? bom.product_tmpl_id : null;
        if (!tmpl) continue;

        // 2. Resolve product template -> sku/name.
        const tmplRows = await odooExecuteKw<
          Array<{
            id: number;
            default_code: string | false;
            name: string;
            description_sale: string | false;
          }>
        >(creds, uid, "product.template", "read", [[tmpl[0]]], {
          fields: ["id", "default_code", "name", "description_sale"],
        });
        const tmplRow = tmplRows[0];
        if (!tmplRow) continue;

        const sku =
          (tmplRow.default_code && String(tmplRow.default_code)) ||
          `ODOO-TMPL-${tmplRow.id}`;
        const slugBase = sku
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || `tmpl-${tmplRow.id}`;

        // Upsert product
        let productId: string;
        const { data: prod, error: pErr } = await context.supabase
          .from("products")
          .upsert(
            {
              organization_id: conn.organization_id,
              erp_connection_id: conn.id,
              erp_product_id: String(tmplRow.id),
              sku,
              name: tmplRow.name,
              description: tmplRow.description_sale
                ? String(tmplRow.description_sale)
                : null,
              is_active: true,
              web_slug: slugBase,
            },
            { onConflict: "organization_id,sku" },
          )
          .select("id")
          .single();
        if (pErr) {
          // slug collision fallback: append product id
          const { data: prod2, error: pErr2 } = await context.supabase
            .from("products")
            .upsert(
              {
                organization_id: conn.organization_id,
                erp_connection_id: conn.id,
                erp_product_id: String(tmplRow.id),
                sku,
                name: tmplRow.name,
                description: tmplRow.description_sale
                  ? String(tmplRow.description_sale)
                  : null,
                is_active: true,
                web_slug: `${slugBase}-${tmplRow.id}`,
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
        productsTouched += 1;

        // 3. Fetch BOM lines.
        const lines = await odooExecuteKw<Array<Record<string, unknown>>>(
          creds,
          uid,
          "mrp.bom.line",
          "search_read",
          [[["bom_id", "=", bom.id]]],
          { fields: ["product_id", "product_qty", "product_uom_id"], limit: 500 },
        );

        // 3a. Resolve each line's variant -> template SKU so the parts list
        // shows the template-level code (e.g. TF300601) rather than the
        // variant suffix (TF300601-CC).
        const variantIds = Array.from(
          new Set(
            lines
              .map((l) => {
                const f = l.product_id;
                return Array.isArray(f) && typeof f[0] === "number"
                  ? (f[0] as number)
                  : null;
              })
              .filter((v): v is number => v !== null),
          ),
        );
        const variantToTemplateSku = new Map<number, string>();
        if (variantIds.length > 0) {
          const variantRows = await odooExecuteKw<
            Array<{
              id: number;
              product_tmpl_id: [number, string] | false;
            }>
          >(creds, uid, "product.product", "read", [variantIds], {
            fields: ["id", "product_tmpl_id"],
          });
          const tmplIds = Array.from(
            new Set(
              variantRows
                .map((r) =>
                  Array.isArray(r.product_tmpl_id) ? r.product_tmpl_id[0] : null,
                )
                .filter((v): v is number => v !== null),
            ),
          );
          const tmplSkuById = new Map<number, string>();
          if (tmplIds.length > 0) {
            const tmplRows2 = await odooExecuteKw<
              Array<{ id: number; default_code: string | false }>
            >(creds, uid, "product.template", "read", [tmplIds], {
              fields: ["id", "default_code"],
            });
            for (const t of tmplRows2) {
              if (t.default_code) tmplSkuById.set(t.id, String(t.default_code));
            }
          }
          for (const v of variantRows) {
            const t = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : null;
            const tplSku = t !== null ? tmplSkuById.get(t) : undefined;
            if (tplSku) variantToTemplateSku.set(v.id, tplSku);
          }
        }

        const { normalizeBomLines, sha256Hex } = await import("./erp-utils");
        const normalized = normalizeBomLines(lines, variantToTemplateSku);
        const hash = await sha256Hex(JSON.stringify(normalized));

        // 4. Insert snapshot if unique (content_hash unique per product).
        const { data: snapIns, error: sErr } = await context.supabase
          .from("bom_snapshots")
          .insert({
            product_id: productId,
            erp_connection_id: conn.id,
            erp_bom_id: String(bom.id),
            erp_bom_revision: bom.code ? String(bom.code) : null,
            raw_payload: { bom, lines } as never,
            normalized_items: normalized as never,
            content_hash: hash,
            captured_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (sErr) {
          // Duplicate (same hash) — not a real error
          if (!String(sErr.message).includes("duplicate")) {
            console.warn("[syncBoms] snapshot insert error", sErr.message);
          }
        } else if (snapIns) {
          changed += 1;
          await context.supabase.from("sync_events").insert({
            organization_id: conn.organization_id,
            erp_connection_id: conn.id,
            product_id: productId,
            event_type: "bom_change_detected",
            payload: { snapshot_id: snapIns.id, bom_id: bom.id },
          });
        }
      }

      // Stamp success
      await context.supabase
        .from("erp_connections")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "success",
          last_sync_error: null,
        })
        .eq("id", conn.id);

      await context.supabase.from("sync_events").insert({
        organization_id: conn.organization_id,
        erp_connection_id: conn.id,
        event_type: "bom_sync_succeeded",
        payload: { scanned, changed, products: productsTouched },
      });

      return { ok: true as const, scanned, changed, productsTouched };
    } catch (e) {
      const msg = (e as Error).message;
      await context.supabase
        .from("erp_connections")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "failed",
          last_sync_error: msg.slice(0, 500),
        })
        .eq("id", conn.id);
      await context.supabase.from("sync_events").insert({
        organization_id: conn.organization_id,
        erp_connection_id: conn.id,
        event_type: "bom_sync_failed",
        payload: { error: msg },
      });
      return { ok: false as const, error: msg };
    }
  });

// ---------------- On-demand BOM sync for a single SKU ---------------------
// Used by the manual editor so freshly-created manuals can pull their BOM
// (and `.x` hardware kit) live from Odoo without requiring a full
// `syncBoms` run first. Resolves the SKU against `product.template` first,
// then `product.product` (variants / inventory-only items), then takes the
// first `mrp.bom` for that template and snapshots its lines.
export async function syncBomBySkuImpl(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  params: { organizationId: string; sku: string; connectionId?: string },
): Promise<{
  ok: boolean;
  found: boolean;
  productId?: string;
  snapshotId?: string;
  lineCount?: number;
  sku: string;
  error?: string;
}> {
  const sku = params.sku.trim().toUpperCase();
  const data = params;
  const context = { supabase } as { supabase: typeof supabase };
  {


      // Resolve connection.
      const connQuery = supabase
        .from("erp_connections")
        .select("id, base_url, database, username, organization_id")
        .eq("organization_id", data.organizationId)
        .eq("provider", "odoo")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      const { data: conn } = data.connectionId
        ? await supabase
            .from("erp_connections")
            .select("id, base_url, database, username, organization_id")
            .eq("id", data.connectionId)
            .maybeSingle()
        : await connQuery.maybeSingle();
      if (!conn) return { ok: false, found: false, sku, error: "No active Odoo connection" };

      try {
        const { data: cred, error: credErr } = await supabase.rpc(
          "erp_read_credentials",
          { _connection_id: conn.id },
        );
        if (credErr) throw credErr;
        const apiKey = (cred as { api_key?: string } | null)?.api_key;
        if (!apiKey) throw new Error("No stored credential for Odoo");

        const { odooAuthenticate, odooExecuteKw } = await import(
          "./odoo-xmlrpc.server"
        );
        const creds = {
          baseUrl: conn.base_url,
          database: conn.database ?? "",
          username: conn.username,
          apiKey,
        };
        const uid = await odooAuthenticate(creds);

        // 1) Find the template id for this SKU (case-insensitive exact).
        let tmplId: number | null = null;
        let variantId: number | null = null;
        let tmplName = sku;
        let tmplDescription: string | null = null;
        const tmplRows = await odooExecuteKw<
          Array<{
            id: number;
            name: string;
            default_code: string | false;
            description_sale: string | false;
            product_variant_id?: [number, string] | false;
          }>
        >(creds, uid, "product.template", "search_read", [
          [["default_code", "=ilike", sku]],
        ], {
          fields: ["id", "name", "default_code", "description_sale", "product_variant_id"],
          limit: 1,
          context: { active_test: false },
        });
        if (tmplRows && tmplRows.length > 0) {
          tmplId = tmplRows[0].id;
          tmplName = tmplRows[0].name;
          tmplDescription = tmplRows[0].description_sale
            ? String(tmplRows[0].description_sale)
            : null;
          if (Array.isArray(tmplRows[0].product_variant_id)) {
            variantId = tmplRows[0].product_variant_id[0];
          }

          // Odoo may find the `.x` kit as a product.template, while its BOM is
          // attached to the concrete product.product variant. Resolve the
          // matching variant even after a template hit so the BOM domain can
          // search both product_id and product_tmpl_id.
          const exactVariants = await odooExecuteKw<
            Array<{ id: number; name: string; default_code: string | false; product_tmpl_id: [number, string] | false }>
          >(creds, uid, "product.product", "search_read", [
            [["default_code", "=ilike", sku], ["product_tmpl_id", "=", tmplId]],
          ], {
            fields: ["id", "name", "default_code", "product_tmpl_id"],
            limit: 1,
            context: { active_test: false },
          });
          if (exactVariants?.[0]) variantId = exactVariants[0].id;
        } else {
          // Fall back to product.product (variant / inventory-only). This is
          // how `.x` hardware kits often live in Odoo. Check active + archived.
          const variantRows = await odooExecuteKw<
            Array<{ id: number; name: string; product_tmpl_id: [number, string] | false }>
          >(creds, uid, "product.product", "search_read", [
            [
              "&",
              ["default_code", "=ilike", sku],
              "|",
              ["active", "=", true],
              ["active", "=", false],
            ],
          ], {
            fields: ["id", "name", "product_tmpl_id"],
            limit: 1,
            context: { active_test: false },
          });
          const v = variantRows?.[0];
          if (v && Array.isArray(v.product_tmpl_id)) {
            tmplId = v.product_tmpl_id[0];
            variantId = v.id;
            tmplName = v.name;
          }
        }

        if (tmplId === null) {
          return { ok: true, found: false, sku };
        }

        // 2) Find a mrp.bom for that template OR for the specific variant.
        // `.x` hardware kits are typically attached to a variant via product_id,
        // not to the template — search both.
        const bomDomain = (variantId !== null
          ? ["|", ["product_id", "=", variantId], ["product_tmpl_id", "=", tmplId]]
          : [["product_tmpl_id", "=", tmplId]]) as never;
        const boms = await odooExecuteKw<
          Array<{ id: number; code: string | false; product_qty: number }>
        >(creds, uid, "mrp.bom", "search_read", [
          bomDomain,
        ], {
          fields: ["id", "code", "product_qty"],
          limit: 1,
          context: { active_test: false },
        });
        const bom = boms?.[0];

        // Even if there's no BOM, upsert the product row so the rest of the
        // editor has a stable reference for the SKU.
        const slugBase = sku
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || `tmpl-${tmplId}`;
        const { data: prod } = await supabase
          .from("products")
          .upsert(
            {
              organization_id: conn.organization_id,
              erp_connection_id: conn.id,
              erp_product_id: String(tmplId),
              sku,
              name: tmplName,
              description: tmplDescription,
              is_active: true,
              web_slug: slugBase,
            },
            { onConflict: "organization_id,sku" },
          )
          .select("id")
          .single();
        const productId = prod?.id;
        if (!productId) return { ok: false, found: false, sku, error: "Could not upsert product" };

        if (!bom) {
          return { ok: true, found: false, productId, sku };
        }

        // 3) Fetch lines + resolve variant->template SKU mapping.
        const lines = await odooExecuteKw<Array<Record<string, unknown>>>(
          creds,
          uid,
          "mrp.bom.line",
          "search_read",
          [[["bom_id", "=", bom.id]]],
          { fields: ["product_id", "product_qty", "product_uom_id"], limit: 500 },
        );

        const variantIds = Array.from(
          new Set(
            lines
              .map((l) => {
                const f = l.product_id;
                return Array.isArray(f) && typeof f[0] === "number"
                  ? (f[0] as number)
                  : null;
              })
              .filter((v): v is number => v !== null),
          ),
        );
        const variantToTemplateSku = new Map<number, string>();
        if (variantIds.length > 0) {
          const variantRows = await odooExecuteKw<
            Array<{ id: number; product_tmpl_id: [number, string] | false }>
          >(creds, uid, "product.product", "read", [variantIds], {
            fields: ["id", "product_tmpl_id"],
          });
          const tmplIds = Array.from(
            new Set(
              variantRows
                .map((r) => (Array.isArray(r.product_tmpl_id) ? r.product_tmpl_id[0] : null))
                .filter((v): v is number => v !== null),
            ),
          );
          const tmplSkuById = new Map<number, string>();
          if (tmplIds.length > 0) {
            const tmplRows2 = await odooExecuteKw<
              Array<{ id: number; default_code: string | false }>
            >(creds, uid, "product.template", "read", [tmplIds], {
              fields: ["id", "default_code"],
            });
            for (const t of tmplRows2) {
              if (t.default_code) tmplSkuById.set(t.id, String(t.default_code));
            }
          }
          for (const v of variantRows) {
            const t = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : null;
            const tplSku = t !== null ? tmplSkuById.get(t) : undefined;
            if (tplSku) variantToTemplateSku.set(v.id, tplSku);
          }
        }

        const normalized = normalizeBomLines(lines, variantToTemplateSku);
        const hash = await sha256Hex(JSON.stringify(normalized));

        const { data: snapIns, error: sErr } = await supabase
          .from("bom_snapshots")
          .insert({
            product_id: productId,
            erp_connection_id: conn.id,
            erp_bom_id: String(bom.id),
            erp_bom_revision: bom.code ? String(bom.code) : null,
            raw_payload: { bom, lines } as never,
            normalized_items: normalized as never,
            content_hash: hash,
            captured_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        // Duplicate hash is fine — snapshot already exists for this content.
        if (sErr && !String(sErr.message).includes("duplicate")) {
          throw sErr;
        }

        return {
          ok: true,
          found: true,
          productId,
          snapshotId: snapIns?.id,
          lineCount: normalized.length,
          sku,
        };
      } catch (e) {
        return { ok: false, found: false, sku, error: (e as Error).message };
      }
    }
}

export const syncBomBySku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        sku: z.string().trim().min(1).max(120),
        connectionId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { syncBomBySkuImpl } = await import("./erp-sync.server");
    return syncBomBySkuImpl(context.supabase, data);
  });

