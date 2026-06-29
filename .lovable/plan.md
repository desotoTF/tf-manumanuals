## Problem

`Sync failed: there is no unique or exclusion constraint matching the ON CONFLICT specification`

The Odoo sync upserts `products` with `onConflict: "organization_id,erp_connection_id,erp_product_id"`. That target is backed only by a **partial** unique index (`products_org_conn_erp_uidx ... WHERE erp_connection_id IS NOT NULL`). PostgREST's `ON CONFLICT` inference can't match a partial index, so the upsert fails.

There are two real unique constraints on `products`:
- `(organization_id, sku)` ✅
- `(organization_id, web_slug)` ✅
- plus the partial index above (not usable by ON CONFLICT)

## Fix

Switch the sync upsert to conflict on **`(organization_id, sku)`** — the natural identity for a product in an org. This also aligns with the new SKU-first manual flow, which already upserts on that key: an ERP sync run will cleanly merge with a manually-created SKU row instead of trying to insert a duplicate.

### Changes

**`src/lib/erp.functions.ts`** (the two upserts around lines 303 and 324):
- `onConflict: "organization_id,erp_connection_id,erp_product_id"` → `onConflict: "organization_id,sku"`
- Keep all current fields in the payload so the existing row gets its `erp_connection_id`, `erp_product_id`, `name`, `description`, `web_slug` refreshed on each sync.
- Slug-collision fallback (the second upsert with `${slugBase}-${tmplRow.id}`) stays as-is, just with the new conflict target.

No migration needed — the `(organization_id, sku)` unique constraint already exists.

### Out of scope

- The partial index `products_org_conn_erp_uidx` stays; it's still useful for lookups by `erp_product_id` and harmless. Removing it can be a later cleanup.
- No changes to the Odoo auth path — your new API key resolved that.
