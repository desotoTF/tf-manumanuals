# Clean up placeholder product records from the Odoo sync

## Where "ODOO-TMPL-*" comes from

They are not partial manuals and not SKU lookups. They come from the **BOM sync** with Odoo.

When the sync runs, it reads up to 200 manufacturing BOMs from Odoo and creates one product record in this app for every BOM's parent item, so the app can track that item's parts list. If that Odoo item has no internal reference (no SKU filled in on the Odoo side), the sync has nothing to name it with, so it invents a stand-in name: `ODOO-TMPL-` plus the Odoo item's internal number.

That's how you ended up with 129 of them out of 142 total product records. Most are sub-assemblies, weldments, and component kits that have a BOM in Odoo but no SKU on the item card.

This also explains the error you hit: each product record is locked to one Odoo item, and those placeholders had already claimed their items. That part is already fixed — creating a manual now takes over the matching record and renames it to the real SKU and product name instead of failing.

## Proposed cleanup

1. **Stop creating naked placeholders.** When the BOM sync meets an Odoo item with no internal reference, still store it (the BOM data is useful) but flag it as a sync-only record rather than treating it as a real product.
2. **Hide sync-only records from the UI.** They disappear from the products list and from the Create Manual picker, so your catalog shows only genuine products. They stay linked to Odoo, and their BOM data keeps working.
3. **Backfill the existing 129.** A one-time action in Settings → ERP re-checks each placeholder against Odoo: if the item has since been given an internal reference, the record is renamed to the real SKU and name; otherwise it is marked sync-only. Result summary shows how many were renamed and how many were hidden.

Nothing is deleted. Existing BOM snapshots and the manuals already attached to products stay untouched.

## Technical notes

- Migration: add `products.is_sync_placeholder boolean not null default false`.
- `src/lib/erp.functions.ts` (`syncBoms`, around line 240): when `default_code` is missing, keep the `ODOO-TMPL-<id>` SKU as an internal key but set `is_sync_placeholder = true`; when it is present, set it back to `false`.
- `src/lib/products.functions.ts`: exclude `is_sync_placeholder` rows from `listProductsWithStatus` and `listProductsWithoutManual`.
- New server function `backfillPlaceholderProducts`: selects org products with `sku like 'ODOO-TMPL-%'`, batch-reads matching `product.template` rows via `odooExecuteKw`, updates `sku`/`name`/`template_sku`/`web_slug` when a real code exists, otherwise sets the placeholder flag. Skips and reports any record whose real SKU is already taken by another row.
- `src/routes/_authenticated/settings.erp.tsx`: "Clean up synced products" button with confirm step and result summary.
