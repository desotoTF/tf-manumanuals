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

