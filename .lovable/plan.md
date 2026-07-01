## Goal

Build a per-organization **part catalog** keyed by SKU that stores an optional **image** and an optional **alias** (display-name override). It gets populated gradually while editing manuals, so future manuals autofill enriched part info without extra work.

You landed on the right simplification: alias replaces the separate "Name Exclusions" idea. One catalog covers both images and friendly names.

## Behavior

**BOM autofill (unchanged pull):** Odoo still returns `{sku, name, qty}`. On load, we look up the catalog for each SKU in the current org:

- If `alias` exists → the editor and PDF show `alias` instead of the Odoo name.
- If `image` exists → it renders next to the row on screen and in the PDF, matching the sample manual.
- If neither exists → today's behavior (SKU + Odoo name only).

**Editing in the Parts tab:**

- Each row shows: SKU · Qty · Display name (editable) · Image slot (upload / replace / clear) · small "reset to Odoo name" affordance.
- The row keeps showing the original Odoo name in muted text underneath so the user always sees the source.
- Editing the name or setting an image writes to the catalog (upsert on `{org_id, sku}`) — not to the manual JSON. So the next manual that uses that SKU inherits it automatically.
- Same UI on both **Parts** and **Hardware kit** lists.

**BOM settings page (renamed from "BOM exclusions"):**

- Route stays at `/settings/bom-exclusions` to avoid breakage; page title becomes **BOM settings**.
- Two tabs:
  1. **Part exclusions** — existing SKU-pattern list, unchanged.
  2. **Part catalog** — searchable table of every catalog entry for the org: SKU, alias, thumbnail, "last used in &nbsp;", inline edit, delete. This is where admins can bulk-curate names/images without opening a manual.

## Data model (new)

One new table, one storage prefix:

- `public.part_catalog`
  - `id uuid pk`
  - `organization_id uuid` (FK, cascades)
  - `sku citext` — matched case-insensitively
  - `alias text null` — friendly display name; null = use Odoo name
  - `image_path text null` — path in the existing `manual-assets` bucket, under `part-catalog/<org_id>/<sku>.<ext>`
  - `created_by`, `created_at`, `updated_at`, plus `updated_by`
  - Unique index on `(organization_id, sku)`
  - RLS: org members read; admins+editors write. Standard GRANTs.
- Reuse the existing `manual-assets` bucket for images (no new bucket).
- Sidecar RPC `list_part_catalog(_org uuid, _skus text[])` for cheap batch lookup during editor load and PDF render.

## PDF / preview render

`MasterManualPreview` and the PDF template get a small helper `resolvePart(sku, fallbackName, catalogMap)` → `{displayName, imageUrl}`. Parts + hardware-kit rows render the image in a fixed-width thumbnail column when present, matching the sample PDF layout you shared.

## Server functions (new file `src/lib/part-catalog.functions.ts`)

- `listPartCatalog({organizationId, skus?})` — batch lookup for the editor and PDF.
- `upsertPartCatalogEntry({organizationId, sku, alias?, imageAssetPath?})` — used by inline edits.
- `deletePartCatalogEntry({id})` — admin/editor.
- `clearPartCatalogImage({id})` and `clearPartCatalogAlias({id})` — small helpers so "reset to Odoo" is one call.

All use `requireSupabaseAuth`. Image uploads go through a signed-URL flow into `manual-assets` (same pattern as existing manual images) — no new upload endpoint needed.

## What is NOT changing

- Odoo pull code, BOM snapshot storage, exclusion matching logic — all untouched.
- Manual JSON schema stays as-is; alias/images are resolved at read time, so historical manuals stay reproducible if you ever revert an alias.
- No "Name Exclusions" feature — the alias table replaces it (per your call).

## Rollout order

1. Migration: `part_catalog` table + RLS + GRANTs + RPC + storage folder convention.
2. `part-catalog.functions.ts` server functions.
3. Editor Parts + Hardware-kit rows: alias input, image slot, catalog upsert on blur/upload. Batch-load catalog once per editor open.
4. PDF/preview renderer: thumbnail column + alias resolution.
5. Rename settings page to "BOM settings", add tabs, build the Part catalog admin table.

## Open questions before I build

1. When a user edits the alias inline in a manual, should it **immediately** upsert to the org catalog, or only when they save the manual? (Immediate is simpler and matches the "populate over time" goal — my default.) Yes, immediate
2. If two editors set different aliases for the same SKU, last-write-wins on the catalog. OK, or do you want an audit log / per-manual override too? - last-write-wins, also, only admin can edit aliases and images. Editor cannot.
3. Image size cap for part thumbnails — 1 MB, resized to ~512 px on upload? (Keeps PDFs light.) These might be printed; Let's go 3MB max, size doesn't matter, template should size/scale appropriately...