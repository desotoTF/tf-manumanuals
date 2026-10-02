// Server-only helper: pull a product's photo (image_1920) from Odoo, store it
// in the manual-assets bucket and hand back a long-lived signed URL.
// Shared by the "Use Odoo image" button and by manual creation.

export interface OdooCoverResult {
  url: string;
  storagePath: string;
}

/**
 * Fetches the Odoo photo for a product row. Throws with a user-readable
 * message when something is missing (used by the explicit button); callers
 * that want a best-effort attempt should catch.
 */
export async function fetchOdooProductImage(
  supabase: any,
  productId: string,
): Promise<OdooCoverResult> {
  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id, organization_id, erp_product_id, erp_connection_id")
    .eq("id", productId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!product) throw new Error("Product not found");
  if (!product.erp_product_id) {
    throw new Error("Product is not linked to an Odoo template.");
  }

  const { data: conn } = await supabase
    .from("erp_connections")
    .select("id, base_url, database, username, is_active")
    .eq(
      "id",
      product.erp_connection_id ?? "00000000-0000-0000-0000-000000000000",
    )
    .maybeSingle();
  const fallbackConn = conn
    ? null
    : (
        await supabase
          .from("erp_connections")
          .select("id, base_url, database, username, is_active")
          .eq("organization_id", product.organization_id)
          .eq("provider", "odoo")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data;
  const erpConn = conn ?? fallbackConn;
  if (!erpConn) throw new Error("No active Odoo connection for this org.");

  const { data: cred, error: credErr } = await supabase.rpc(
    "erp_read_credentials",
    { _connection_id: erpConn.id },
  );
  if (credErr) throw credErr;
  const apiKey = (cred as { api_key?: string } | null)?.api_key;
  if (!apiKey) throw new Error("Odoo credentials not available.");

  const { odooAuthenticate, odooExecuteKw } = await import(
    "./odoo-xmlrpc.server"
  );
  const creds = {
    baseUrl: erpConn.base_url,
    database: erpConn.database ?? "",
    username: erpConn.username,
    apiKey,
  };
  const uid = await odooAuthenticate(creds);
  const rows = await odooExecuteKw<Array<{ id: number; image_1920?: string | false }>>(
    creds,
    uid,
    "product.template",
    "read",
    [[Number(product.erp_product_id)]],
    { fields: ["image_1920"] },
  );
  const raw = rows?.[0]?.image_1920;
  if (!raw || typeof raw !== "string") {
    throw new Error("No image set on this Odoo product.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bytes = Buffer.from(raw, "base64");
  const path = `cover-images/${product.organization_id}/${productId}/${Date.now()}-odoo.png`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("manual-assets")
    .upload(path, bytes, { contentType: "image/png", upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const { data: signed, error: sErr } = await supabaseAdmin.storage
    .from("manual-assets")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (sErr) throw new Error(`Signing failed: ${sErr.message}`);
  return { url: signed.signedUrl, storagePath: path };
}

/** Best-effort variant: returns null instead of throwing. */
export async function tryFetchOdooProductImage(
  supabase: any,
  productId: string,
): Promise<OdooCoverResult | null> {
  try {
    return await fetchOdooProductImage(supabase, productId);
  } catch {
    return null;
  }
}
