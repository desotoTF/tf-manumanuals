# Plan

## 1. Image editor (`ImageEditorDialog.tsx`)

- Fix Arrow color: the arrow group's shaft/head are created with `fill`/`stroke` from state at add-time only. Rewire the "style pickers → active object" effect to walk into `fabric.Group` children and update line/polygon `stroke`+`fill` (right now `.set({fill, stroke})` on a Group is a no-op for its children).
- Add **Crop** to the toolbar (next to Rect/Circle/Arrow/Text). Behavior:
  - Enters crop mode → overlays a draggable/resizable rect on the canvas.
  - "Apply crop" button confirms → we re-render both the background `<img>` and the fabric canvas to the cropped region, scaling annotations proportionally. Original source image reference is replaced with the cropped bitmap so `handleSave` still exports full-resolution.
  - "Cancel crop" restores.

## 2. Tools manager (modal from gear icon)

- New `ToolsManagerDialog.tsx` opened by a gear icon rendered next to the Tools combobox in the manual editor (find current usage of `listTools`/`upsertTool`).
- Modal lists all org tools with inline rename, an "Add new" row, and a delete button.
- Delete is **blocked if referenced**: add `countToolUsage(toolId)` server fn that scans `manual_versions.content` JSON for the tool id/name. If count > 0, show usage count and disable delete with an explanation.
- Rename updates the row in `public.tools`; existing manuals reference tools by id so rename propagates automatically on next render. If tools are stored by name in version content, rename also rewrites those occurrences (will confirm during implementation by reading `ManualListEditors.tsx` / version schema).

## 3. Reset password on login

- Add "Forgot password?" link on `src/routes/auth.tsx` → opens a small inline form that calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/auth/reset })`.
- New route `src/routes/auth.reset.tsx` handles the recovery session and lets the user set a new password via `supabase.auth.updateUser({ password })`.

## 4. Page-2 (Parts & Tools) upgrades

Files: `src/components/manual/MasterManualPreview.tsx`, `StepLayoutView.tsx`, `src/routes/_authenticated/products.$productId.tsx`, and the editor sidebar.

- **Extra one-column steps on page 2**: extend the manual version schema with `partsPageSteps: Step[]` (or reuse existing step list with a `page: 'parts'` marker). Render below the two-col parts+tools block; if content overflows the page height, the renderer already page-breaks — verify and add a forced break helper if needed.
- **Callout always available on parts step**: move the callout dropdown outside the step body so it's visible whether or not any step exists. Values: `none | info | caution | danger`. Persist on the parts page object, render in `MasterManualPreview` above/below the two-col block.
- **Right-hand sidebar redesign** (from the mock): two distinct cards.
  - **Card 1 — Cover Page (1)**: cover image with Replace / Odoo fetch / Remove (unchanged behavior, restyled).
  - **Card 2 — Parts & Tools Page (2)**: "Add step" button + "Add callout" dropdown, then a list of any extra steps with reorder/delete. Consistent card chrome (border, header, spacing) with the rest of the app's shadcn cards.

## Technical notes

- No new tables needed; extend the JSON schema stored in `manual_versions.content`.
- Fabric Group children mutation: use `active.forEachObject((o) => o.set(...))` or specifically target `line`/`polygon` types.
- Crop implementation: draw a `fabric.Rect` with `hasControls: true`, on Apply create an offscreen canvas cropped from `originalImageRef.current`, then reload the dialog state with the new bitmap.
- Tool usage scan: `select id, content from manual_versions where content::text ilike '%<toolId>%'` server-side is fine at this scale; refine to structured JSONB path check.
- Reset route: only accessible during a recovery session; if `getSession()` has no `recovery` event, render "link expired".
