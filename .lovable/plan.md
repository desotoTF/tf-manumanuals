
## What we're building

A new **Manual Editor** page where an author picks a product (SKU), the Parts + Hardware Kit sections auto-fill from Odoo BOM data, and Tools are managed via a reusable autocomplete. Everything is drag-reorderable and freely editable after the autofill. Template seeding stays empty per your call.

## How the SKU / .x split works

The parent product (e.g. `TF292001`) has a BOM. That BOM contains:
- real install parts (Front Upper Driver Control Arm, Axles, …)
- the hardware-kit child SKU `TF292001.x`
- noise we always want to drop (`TF-Instruct`, `TF000001-01`, `TF041401 PK`, plus anything the org adds later)

The editor will:
1. Take the entered SKU, find the product's latest `bom_snapshot`.
2. Apply the org's exclusion list (built-in seeds + user-added).
3. Split remaining lines: anything whose `part_number` ends in `.x` becomes a marker — we then fetch that child product's BOM snapshot and use *its* lines as the **Hardware Kit**.
4. Everything else becomes the **Parts** list.

If the `.x` product has no synced BOM, Hardware Kit comes up empty and we show a "Sync BOMs to pull hardware kit" inline notice.

## DB changes (one migration)

```text
public.tools
  id uuid pk, organization_id uuid fk, name citext, spec text, created_by uuid, created_at, updated_at
  UNIQUE(organization_id, lower(name))
  RLS: org members read; admins+ insert/update/delete

public.bom_exclusions
  id uuid pk, organization_id uuid fk, pattern text, match_type enum('exact','prefix','suffix','contains'),
  is_seed bool, note text, created_by uuid, created_at
  UNIQUE(organization_id, lower(pattern), match_type)
  RLS: org members read; admins+ write
  Seeded per org on first read with: TF-Instruct (exact), TF000001-01 (exact), TF041401 PK (exact)
```

GRANTs to `authenticated` + `service_role` (no anon). Both tables get a `tg_set_updated_at` trigger on `tools`.

## New server functions (`src/lib/`)

- `tools.functions.ts` — `listTools`, `upsertTool` (case-insensitive de-dupe, returns existing id if name already present)
- `bom-exclusions.functions.ts` — `listExclusions`, `addExclusion`, `removeExclusion`, `seedDefaultExclusions` (idempotent, called on first list)
- Extend `manuals.functions.ts` with `loadBomForManual({ productId })`:
  returns `{ parts: NormalizedBomItem[], hardware: NormalizedBomItem[], excluded: string[], hardwareSku: string | null }`. Pure read; no writes to manual content. The editor decides whether to apply / overwrite.

## New manual editor route

`src/routes/_authenticated/manuals.$manualId.edit.tsx` — TanStack Query loader fetches manual + latest draft version. Page sections:

```text
[ Header ]  product picker (combobox over products) + "Load BOM" button
[ Parts ]            sortable list, add/remove row, inline qty/desc edit
[ Hardware Kit ]     sortable list, add/remove row, inline qty/desc edit
[ Tools ]            sortable list of tool comboboxes; "+ Add tool" appends blank row
[ Save draft ] [ Save & request review ]
```

### Interactions
- **Product picker**: existing products list, searchable by SKU/name. Selecting a product wires it to the manual and enables "Load BOM".
- **Load BOM**: calls `loadBomForManual`, then a confirm dialog if Parts/Hardware are non-empty ("Replace current Parts and Hardware Kit with X items?"). Adds/removes after load are free-form.
- **Tool combobox** (one per row): cmdk popover over `listTools`. Typing filters; if no match, shows `+ Add "{value}"` which calls `upsertTool` then drops the new tool into that row. Bottom of each row has a drag handle; tap "+" at end of list to add another blank row.
- **Drag reorder**: `@dnd-kit/core` + `@dnd-kit/sortable` per section. Order persists in `manual_versions.content` (already array-ordered in `ManualContent`).
- **Persistence**: every change debounces into a `saveDraft` server fn that writes `manual_versions.content` for the in-progress draft (creates one if none exists).

## New settings page

`src/routes/_authenticated/settings.bom-exclusions.tsx` — owner/admin only. Lists the seeded + custom exclusion rows with add/delete. Linked from the Settings sidebar next to Templates / ERP.

## Dependencies

`bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` (already have cmdk via shadcn `Command`).

## What this does NOT do

- Doesn't change the existing template editor (you opted out of seeding the PDF).
- Doesn't change the sync workflow itself — both tables are plain migrations, so they'll flow through `sync-external-db.yml` like everything else once you push.
- Doesn't build the public manual renderer for these new fields (already exists; will just see populated content).

## Order of execution

1. Migration (tables + RLS + grants + exclusion seeds) — surfaces via `supabase--migration` for your approval.
2. After types regen: server functions for tools, exclusions, BOM load, draft save.
3. Manual editor route + sortable sections + tool combobox.
4. Settings page for exclusions + sidebar link.
5. Smoke test: open a product with a synced BOM ending in `.x`, hit Load, reorder a few rows, add a tool via "+ Add", save draft, verify `manual_versions.content` round-trips.
