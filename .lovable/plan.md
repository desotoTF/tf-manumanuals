## Goal

Reframe the app around **Manuals** instead of **Products**. The sidebar entry, the list page, and the create flow all center on manuals. Products still exist underneath (manuals attach to a product for SKU/name/BOM), but they become an implementation detail the user doesn't browse.

## UX changes

**Sidebar**
- Rename "Products" → "Manuals". Route stays `/products` (no URL churn, no broken links).

**Manuals list page** (replaces current Products table at `/products`)
- Header: "Manuals" + "Create Manual" button (top right).
- Table columns:
  - Manual (displayed as `SKU | Product Name` — single sortable/filterable column built for future filtering)
  - Status badge (in sync / out of sync / pending review — same logic as today, sourced from `manual_sync_status` joined via product)
  - Latest version (e.g. `v3 · published` or `v1 · draft`)
  - Last published
  - Last BOM change
- Empty state: "No manuals yet. Click Create Manual to start your first one."
- Row click → opens the manual editor (the existing `/products/$productId` page, which already hosts the editor with BOM autofill + tools + parts widgets).

**Create Manual dialog** (triggered from the button)
- Step 1: Product picker — searchable combobox listing products from the org that **don't already have a manual** (so we don't duplicate). Search by SKU or name. Shows `SKU | Name` rows.
- Step 2 (optional, collapsed by default): Template picker — "No template" or pick from `manual_templates`. Defaults to the org's default template if one is set.
- Submit → calls existing `createManualDraft({ productId, templateId? })` → navigates to the editor for that product.

**Products that aren't synced from Odoo yet**
- The combobox shows whatever is in `public.products`. If the user has zero products, the dialog shows: "No products available. Sync from Odoo in Settings → ERP first." with a link.

## Naming convention

Wherever a manual is displayed in a list/breadcrumb/title (manuals list, editor header, future filters), use `SKU | Product Name` as the canonical label. The underlying `manuals.title` field is left alone (still defaults to `${product.name} — Installation Manual`) so the public/published page title isn't affected — this is purely an internal display convention.

## What does NOT change

- Database schema — no migration needed.
- The editor page itself (`/products/$productId`) keeps all the work we just shipped (BOM autofill, tools combobox, drag/drop, exclusions).
- `createManualDraft` server fn — already does exactly what the new dialog needs.
- Templates settings, BOM exclusions settings, sync logic — untouched.
- Public manual pages at `/manuals/$slug` — untouched.

## Technical details

Files to edit:
- `src/components/AppSidebar.tsx` — change the "Products" nav label to "Manuals" (icon stays or swap to `BookOpen`).
- `src/routes/_authenticated/products.tsx` — rewrite the page body to query manuals instead of products:
  - New server fn `listManualsWithStatus({ organizationId })` in `src/lib/manuals.functions.ts` that returns: `{ manual_id, product_id, sku, product_name, latest_version_number, latest_version_state, last_published_at, sync_status }[]`. Implemented as a join on `manuals → products` + `manual_sync_status` + a lateral pick of the latest `manual_versions` row.
  - Add the "Create Manual" button + dialog component (inline or in a small sibling file `CreateManualDialog.tsx`).
  - Row `onClick` / wrapping `<Link to="/products/$productId" params={{ productId }}>` navigates to the editor.
- `src/lib/products.functions.ts` — add a thin `listProductsWithoutManual({ organizationId })` server fn for the combobox (or reuse `listProductsWithStatus` and filter where `sync_status.status === 'no_manual'` client-side; new fn is cleaner).
- Optional small helper: `formatManualLabel(sku, name) => "${sku} | ${name}"` in `src/lib/types.ts` so the convention is reused.

No route renames, no breaking type changes, no DB work.

## Flow after the change

1. User clicks **Manuals** in the sidebar → sees the manuals table.
2. Clicks **Create Manual** → picks a product (SKU | Name) → optional template → confirms.
3. Lands directly in the editor (existing page) for that new manual draft.
4. Returning later, the manuals list shows it with its latest version + sync status; clicking the row re-opens the editor.

Does this match what you had in mind? If yes, approve and I'll build it.