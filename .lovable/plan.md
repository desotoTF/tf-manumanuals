# Clean up placeholder product records

## Why the "duplicate" error appeared

The manuals list you posted shows 6 manuals. The error had nothing to do with those. It came from the **product catalog** behind the manuals, which currently holds 142 records:

- 2 products with a manual attached
- 11 normal products
- **129 placeholder records** created by an earlier Odoo sync, named like `ODOO-TMPL-111465`, `ODOO-TMPL-106319`, etc.

Each product record is locked to exactly one Odoo item. Those 129 placeholders already claimed 129 Odoo items. When you typed a SKU into Create Manual, the lookup resolved it to an Odoo item that a placeholder already owned, so saving a new record for the same item was refused. That is the "duplicate key" message — it names a product record, not a manual.

That part is already fixed: creating a manual now takes over the existing record and renames it to the real SKU and product name instead of failing.

## What's left to decide

The 129 placeholders are still sitting in the catalog with machine names. They clutter product pickers and make it look like your catalog has items it doesn't.

Proposed cleanup:

1. Add a one-time maintenance action (Settings → ERP) that walks every `ODOO-TMPL-*` record, pulls the real SKU and product name from Odoo, and updates the record in place. Records whose Odoo item has no SKU stay as they are.
2. Hide any record still carrying a placeholder SKU from product pickers and the products list, so nothing half-named shows up in the UI.
3. Show a short result summary: how many were renamed, how many skipped and why.

Nothing is deleted, so existing Odoo links, BOM snapshots, and the two manuals already attached stay intact.

## Technical notes

- New server function `backfillPlaceholderProducts` in `src/lib/erp.functions.ts`: selects org products where `sku like 'ODOO-TMPL-%'`, batch-reads the matching `product.template` rows from Odoo via the existing `odooExecuteKw` helper, and updates `sku`, `name`, `template_sku`, and `web_slug`.
- Collision handling: if the real SKU is already taken by another record, skip and report it rather than overwriting.
- Filter placeholder SKUs out of `listProductsWithoutManual` and `listProductsWithStatus` in `src/lib/products.functions.ts`.
- UI: a "Clean up synced products" button with a confirm step and result summary on `src/routes/_authenticated/settings.erp.tsx`.
