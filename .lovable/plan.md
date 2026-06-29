## Scope

Address four issues raised after the schema sync was confirmed healthy.

---

### 1. Step blocks (per-step block editor with template-controlled modules)

**Data shape.** Today each step is `{ id, title, body }` in `ManualContent.steps`. Replace `body: string` with `blocks: StepBlock[]` while keeping legacy `body` readable (auto-migrated on first edit). Block types:

- **text** — rich text (TipTap: bold, italic, underline, lists, links, headings, inline images pasted/dropped)
- **image** — single image from the manual's library, with caption + size (small / medium / full-width) + alignment
- **two-column** — left/right cells, each holding one of {text, image}
- **callout** — severity (info/caution/danger) + body
- **table** — simple rows/cols
- **figure-row** — N images side by side with shared caption (the "two row blocks" default — actually a row of stacked image+text pairs)

Default for a new step = one **text** block + a "+ Add block" menu listing the modules the active template allows.

**Template control.** Extend `manual_templates` with an `allowed_blocks` JSON column (array of block type strings) and an `extra_modules` JSON column (template-author-defined block presets — name, base type, default props). The master template defaults to all built-in blocks enabled. Org admins can add custom module presets in `/settings/templates` (later turn — out of scope for this pass).

**Editor UI.** Replace the plain textarea per step in `ManualListEditors.tsx` with a `StepBlocksEditor` that renders each block with its own controls + a block-type menu filtered by `template.allowed_blocks`. Reorder blocks within a step via up/down buttons.

**Public render.** `manuals.$slug.tsx` renders blocks in order per step. Figure tokens `{{fig:...}}` continue to work inside text blocks.

**Migration.** SQL migration adds `allowed_blocks jsonb default '["text","image","two_column","callout","table","figure_row"]'::jsonb` and `extra_modules jsonb default '[]'::jsonb` to `manual_templates`. No data migration needed — runtime reads `step.blocks ?? [{type:'text', body: step.body}]`.

---

### 2. Per-step images

Falls out of #1: the **image** and **figure-row** blocks are how images attach to a step. The existing `{{fig:N}}` reference token from the global image library still works inside text blocks for inline cross-references.

---

### 3. Torque section

Keep as-is. No change.

---

### 4. SKU / variant handling (Odoo)

**Lookup (`lookupProductBySku`).** Today it queries `product.product` only, which is variant-level. Change behavior:

1. If exact match on `product.product.default_code` → return that variant (current behavior).
2. Otherwise query `product.template` where `default_code = sku`. If 1 template hit → fetch its variants (`product.product` where `product_tmpl_id = X`). If 1 variant → return it. If >1 variants → return `{ source: 'odoo_variants', variants: [...] }` and the UI shows a picker.
3. If no template hit either → `not_found` (unchanged).

**Create-manual flow.** Add a variant picker step that appears only when the lookup returns multiple variants. User selects one variant; that variant's id/SKU is stored on the `products` row.

**BOM rendering.** When importing a BOM line, store both the variant SKU (`product.product.default_code`) and the template SKU (`product_tmpl_id[1]` → fetch `product.template.default_code`). Display the **template SKU** on the parts list by default. Keep variant SKU in the row for traceability / future "show variants" toggle.

**Schema.** Add `template_sku text` to `bom_snapshots` line items (lines are JSON, so this is a JSON-shape change handled in the importer + UI — no migration needed). Add `erp_template_id text` and `template_sku text` to `products` for the chosen template reference.

---

## Technical Notes

- TipTap deps to add: `@tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image`.
- Type changes in `src/lib/types.ts`: add `StepBlock` union and `ManualStep.blocks?`. Keep `body?` for back-compat reads.
- Editor lives in a new `src/components/manual-editor/StepBlocksEditor.tsx` and per-block components under `src/components/manual-editor/blocks/`.
- Public render moves into `src/components/manual/StepBlocksView.tsx` reused by `manuals.$slug.tsx` and `MasterManualPreview.tsx`.
- Odoo: extend `src/lib/odoo-xmlrpc.server.ts` callers; no XML-RPC client changes needed.
- Migration is small and idempotent (additive columns with defaults).

---

## Out of Scope (this turn)

- Authoring custom modules in `/settings/templates` UI (DB column ready; UI in a follow-up).
- Variant switcher on the public manual page.
- PDF export of block content.

---

## Order of Work

1. Migration: add `allowed_blocks`, `extra_modules` to `manual_templates`; add `erp_template_id`, `template_sku` to `products`.
2. Install TipTap deps.
3. Types: `StepBlock` union; loosen `ManualStep`.
4. Build `StepBlocksEditor` + block components.
5. Wire into `ManualListEditors.tsx`, replacing the textarea body.
6. Build `StepBlocksView` and swap into public route + master preview.
7. Update `lookupProductBySku` for template fallback + multi-variant return; add variant-picker UI to create-manual flow.
8. Update BOM importer to capture template SKU; render template SKU in parts list.
9. Smoke-test in preview: create manual via SKU lookup with variants, build a step with a two-column block, view published page.

Migration first (separate approval), then code in one batch.