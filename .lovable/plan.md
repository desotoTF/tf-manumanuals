## Where we are

Done already: Odoo connect & BOM sync, products list, per-product 3-column manual editor (draft → in_review → approved → published), public manual page, image asset attach.

Three slices remain. We'll plan all three; build slice 1 first, then check in.

---

## Slice 1 — Legacy manual import + Manual Templates

Two related pieces shipped together because they share the editor surface.

### 1a. Manual Templates (admin-managed)

New concept: a **template** is a reusable manual skeleton (predefined sections, default fields, a layout preset) that authors pick from when starting a manual — whether from scratch or from an imported PDF.

**DB additions** (migration):
- `manual_templates` table
  - `id`, `organization_id`, `name`, `description`, `layout` (enum: `classic`, `compact`, `field_guide`, `service_card` — controls rendering on `/manuals/$slug`)
  - `default_content` JSONB — pre-seeded `ManualContent` skeleton (tools/parts/steps/warnings/torque/images stubs)
  - `is_default` bool, `created_by`, timestamps
- `manuals.template_id` nullable FK → `manual_templates.id`
- RLS: org members read; owner/admin write. GRANTs added per project rules.

**Server fns** (`src/lib/templates.functions.ts`):
- `listTemplates({organizationId})`, `getTemplate({id})`, `upsertTemplate({...})`, `deleteTemplate({id})`, `setDefaultTemplate({id})`

**UI**:
- New route `_authenticated/settings.templates.tsx` — list / create / edit templates (admin only). Form for name, description, layout, plus a JSON-driven section editor that mirrors the structured content editor.
- Template picker added to "Create manual" / "New draft version" flow on `products.$productId.tsx`.
- Public renderer (`manuals.$slug.tsx`) honors `template.layout` for visual differences.

### 1b. Legacy manual import (PDF → editor + images)

**Storage**: reuse existing private `manual-assets` bucket for both extracted images and the original source PDF.

**Server fn** `importLegacyManualFromPdf` in `src/lib/manuals.functions.ts`:
1. Accept `{productId, templateId?, fileUrl|signedPath, originalFilename}`.
2. Download the PDF from storage (server-side) using `supabaseAdmin` after role check.
3. Use Lovable AI Gateway with `google/gemini-2.5-flash` to extract structured content from the PDF (`type: file` content block) — prompt asks for `{tools, parts, steps, warnings, torque_specs}` matching our `ManualContent` schema.
4. Use `pdf-lib` / a pure-JS extractor compatible with the Worker runtime to pull embedded raster images; upload each to `manual-assets` and create `manual_assets` rows.
5. Merge AI-extracted text into the chosen template's `default_content`; create a new `manual_versions` row in `draft` state pre-filled with that content + image references.
6. Stamp `manuals.source` = `'imported_pdf'` and store the source PDF path on the version (`source_pdf_path` column — small migration add).

**UI** on `products.$productId.tsx`:
- "Import from PDF" button next to "Create manual".
- Modal: file input (PDF only, ≤20 MB), template select, then progress while the server fn runs. On success, navigate to the new draft.

**Worker runtime guardrails**: PDF text+image extraction must be pure JS, no native deps. We'll use `pdfjs-dist` (legacy build) — known to work in Workers — and fall back to AI text extraction if image-only/scanned.

---

## Slice 2 — Products filter/search + BOM browser

### Filters on `/products`
- Search box (debounced) over `sku` + `name`.
- Status filter chips: All / In sync / Out of sync / No manual / Pending review.
- "ERP connection" filter (when org has >1 connection).
- Client-side filter on top of `listProductsWithStatus` (data set is small — no extra round trips).

### Dedicated BOM browser
- New route `_authenticated/products.$productId.bom.tsx` (or a tab inside the editor) — full-width view of all BOM snapshots for a product, with diff between consecutive snapshots.
- New route `_authenticated/boms.tsx` — org-wide BOM search: by part number, with product roll-up ("this part appears in N products").
- Server fn `searchBomLines({organizationId, query})` reads `bom_snapshots.normalized_items` via JSONB containment.

### Sidebar
- Add "BOMs" entry under Products in `AppSidebar.tsx`.

---

## Slice 3 — Editor polish

- "Pull from BOM" button in the editor's Parts tab: inserts all BOM lines (or selected subset) into `content.parts`, deduped by `part_number`.
- BOM drift highlighting: parts present in BOM but missing from the manual are flagged inline.
- Keyboard shortcuts: Cmd/Ctrl+S saves, Cmd/Ctrl+Enter submits for review.
- Auto-save draft on blur (debounced) — current flow is manual save only.

---

## Build order

1. Build Slice 1a (templates) then 1b (PDF import) — same turn or split if 1a gets large.
2. Pause for review, then Slice 2.
3. Pause for review, then Slice 3.

After Slice 1 you'll need to: create at least one template in Settings → Templates, then test "Import from PDF" on a product.
