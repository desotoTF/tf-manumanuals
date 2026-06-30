## Goal

Replace the generic "add block" step editor with a layout-driven step editor. Each step has a layout (one column, two column, two row), and each layout has fixed slots — each slot holds: title + text + optional single image + optional callout. Layouts are configurable in Templates (new section), default to one-column on new manuals, and the most recently used layout becomes the default for the next step. Figure references get a thumbnail picker overlay.

## 1. New step shape

Replace the free-form `blocks: StepBlock[]` model with a layout + slot model.

```text
ManualStep
├── id, title (kept)
├── layout: "one_col" | "two_col" | "two_row"   (default "one_col")
└── slots: StepSlot[]            // length = 1 (one_col) or 2 (two/two_row)

StepSlot
├── id
├── text_html         // TipTap HTML, replaces the old text block
├── asset_id | null   // single image (thumb in editor)
├── caption?
└── callout? { severity, body }   // optional, one per slot
```

Each step owns at most `slots.length` images (so one_col = 1, two_col / two_row = 2). The drop-down "Add block" UI is removed.

Migration: an additive shape change in the `manual_versions.content` JSON. A small reader-side adapter converts any legacy `blocks[]` step to the new `slots[]` shape on load so existing drafts keep rendering. No SQL migration.  
Edit: No migration needed. All existing drafts have been deleted.

## 2. Editor UI (per step card)

Card layout per step:

```text
┌─ Step N ────────────────── [layout switcher ▾] [↑ ↓ 🗑] ┐
│  [ Title input ]                                        │
│  ┌── slot 1 ──┐  ┌── slot 2 ──┐    (slot 2 hidden if    │
│  │ rich text  │  │ rich text  │     layout = one_col;   │
│  │ [+ image]  │  │ [+ image]  │     stacked if two_row) │
│  │ [+ callout]│  │ [+ callout]│                         │
│  └────────────┘  └────────────┘                         │
└─────────────────────────────────────────────────────────┘
[ + Add step ]      ← lives outside / below the cards
```

- Layout switcher: segmented control on the card header. Switching preserves slot 1; switching from two→one drops slot 2 (with confirm if it has content).
- `+ Image` opens the existing image picker for that slot, replaces the thumb when set, with a "Remove" affordance.
- `+ Callout` reveals the existing callout editor inline below the text; "remove" hides it again.
- Generic "Add block" menu is removed entirely.
- "Add step" button moves to a standalone row beneath all step cards. New step inherits the previously used layout.

## 3. Templates: Step Layouts section

Add a second section to `settings.templates.tsx` below "Manual templates":

- List of available step layouts. Built-ins (one_col, two_col, two_row) are always present and not deletable.
- Admin can add custom layout rows now (name + slot count + orientation: row/column). Authoring the actual render is out of scope for this pass — custom layouts are stored but mapped to the closest built-in renderer; this gives the data foundation for future custom layouts.
- Per template, an "Allowed layouts" multi-select picks which layouts authors see in the layout switcher (defaults: all three built-ins enabled). Stored on the existing template row's JSON config.

Layouts list is org-scoped, stored as a small JSON array on the org's template settings (no new table needed for this iteration; if appetite is bigger we add a `manual_step_layouts` table — flagged below).

## 4. Figure reference picker

Keep the `##Fig.` trigger and the "Fig. ref" button, but the popover becomes a thumbnail grid:

- Grid of all images currently placed in steps, in figure order, each tile showing the thumbnail + "Fig. N" + caption.
- Selecting a tile inserts `{{fig:<assetId>}}` at the caret (replacing `##Fig.` if it triggered the popover).
- Reordering, adding, or removing step images recomputes Fig. N — already handled by `buildFigureMapFromSteps`; this stays.
- Implicit same-step token `{{fig:step}}` is kept for in-slot self-reference.

The picker is wired into the rich text editor for each slot's text and into the callout body.

## 5. Renderer

`StepBlocksView` is replaced by `StepLayoutView`:

- Reads `step.layout` + `step.slots`, renders `one_col` as a single column, `two_col` as a two-column grid, `two_row` as stacked rows.
- For each slot: text (with figure tokens resolved) → image (with caption) → callout if present.
- Adapter converts any remaining legacy `blocks[]` step into the new shape before render.

## Technical notes

Files to add/edit:

- `src/lib/types.ts` — add `StepLayout`, `StepSlot`, extend `ManualStep`; keep old block types exported for the adapter.
- `src/lib/step-layout-adapter.ts` (new) — `legacyBlocksToSlots(step)` + `normalizeStep(step)`.
- `src/components/manual-editor/StepBlocksEditor.tsx` — rewrite as `StepLayoutEditor` (layout switcher, slot cards, +image/+callout buttons, no add-block menu).
- `src/components/manual/StepBlocksView.tsx` — rewrite as `StepLayoutView`.
- `src/components/manual-editor/FigureRefField.tsx` + figure picker — thumbnail grid popover; accept image URL in `FigureSource`.
- `src/lib/figure-refs.tsx` — extend `FigureSource` with optional `url`; numbering logic walks `slots[].asset_id`.
- `src/routes/_authenticated/products.$productId.tsx` — pass new shape; persist `step.layout` as the next-step default; "Add step" button moved outside the card list; pipe image URLs into the figure picker.
- `src/routes/_authenticated/settings.templates.tsx` — new "Step layouts" section + "Allowed layouts" multi-select on each template.
- `src/lib/templates.functions.ts` — extend template config JSON with `allowed_step_layouts` and an org-level `step_layouts` array.
- `src/routes/manuals.$slug.tsx` — switch to `StepLayoutView` via adapter.

No DB schema migration; everything fits in existing `manual_versions.content` JSON and template config JSON. If you'd prefer a dedicated `manual_step_layouts` table for org-scoped custom layouts, call that out and I'll add it.

## Open question

Custom layouts in Templates: do you want them to actually render differently in this pass (which means defining a slot grid spec + a generic renderer), or is "data only now, renderer later" fine? My plan above assumes data-only for now.