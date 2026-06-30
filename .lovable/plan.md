This touches ~6 areas. I'll ship them in one commit but in a deliberate order so each piece can be smoke-tested. Total ~4.6k lines of editor code involved; most edits are surgical.

## 1. Images tab (`src/components/manual-editor/ManualListEditors.tsx` images panel)

- **Multi-select upload.** `<input type="file" accept="image/*" multiple>` on the existing "Choose Image" button. Loop uploads sequentially through the existing `uploadAsset` server fn so progress is visible; bail individual failures with a toast, don't abort the batch.
- **URL row layout.** In the asset row, move the URL onto its own second line below the `Fig X · caption` line. Truncate display to 30 chars (`url.length > 30 ? url.slice(0,27)+'…' : url`). Wrap in `<a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 truncate">`.
- **Upload from ZIP button.** New button next to "Choose Image". Uses `JSZip` (already a transitive dep? — if not, `bun add jszip`). Client-side: unzip → filter image entries → for each, derive caption = filename without extension, then call `uploadAsset` + write the caption into `manual_assets.caption`. Progress toast: "Uploading 3/12…".

## 2. Steps tab — inline Choose Image thumb

In `StepLayoutEditor.tsx` image slot picker, append an extra grid tile after the real thumbnails. The tile is a dashed border box, same dimensions as thumbs, with a centered "Choose image" button. Clicking it triggers the same file input + `uploadAsset` flow as the Images tab, and on success the new asset is auto-selected for that slot. Works when zero thumbs exist (tile is the only one shown).

## 3. Preview / PDF

- **Layout rendering bug.** `MasterManualPreview.tsx` + `StepLayoutView.tsx` — verify slot data is being passed through. Likely the preview path reads `step.blocks` while the editor now writes `step.slots`. Run `normalizeStep()` on every step before render (same helper figure-refs already uses). Fix any missing case.
- **"Print / Save as PDF" → "Save as PDF" with download.** Replace the current `window.print()` button with one that calls the new client-side renderer:
  - Use `html2canvas` + `jsPDF` (both small, browser-only, no server). Wrap the preview DOM, paginate by page-break markers we already emit, output `manual-{slug}-v{n}.pdf`, trigger `link.click()`.
  - Icon: `Download` from lucide.
  - `bun add jspdf html2canvas`.

## 4. Manuals page layout (`products.$productId.tsx`)

Currently a single column with: Current Version → Save Draft → Latest BOM → Versions list. Move into a two-col grid (`lg:grid-cols-2`):
- Left column: Current Version card, Save Draft card.
- Right column: Latest BOM card, Versions list card.

On `< lg` they stack as today. No data changes.

## 5. Draft → Approved → Published flow

DB enum `manual_versions.state` already has `draft | in_review | approved | published | superseded`. Work:
- **UI rename.** "Submit for review" button → "Mark Approved"; transitions state directly to `approved` (skip `in_review`).
- **Publish button** appears whenever state is `approved` (or already published, to allow re-publish). Same user can click both.
- **Server fn `publishManualVersion`.** Trigger `tg_version_state_change` already supersedes prior published versions on the same manual → public URL (`/manuals/:slug` keyed by `manuals.public_slug`) keeps resolving to the newest published version. Verify `getPublicManual` selects `state='published' ORDER BY published_at DESC LIMIT 1`; older published versions become `superseded` and remain in DB for internal viewing only — which they already do.
- **Internal version history** in the Versions card continues to show all states.

## 6. Public URL serves PDF

- **Storage.** Reuse existing `manual-assets` bucket; add a new `public-manuals` bucket (public read), created via `supabase--storage_create_bucket`.
- **Render at publish time.** Inside `publishManualVersion` server fn, after the state transition:
  1. Use `@react-pdf/renderer` (Worker-compatible, pure JS) to render a server-side PDF of the manual using the same data shape `MasterManualPreview` consumes. Build a `<ManualPdfDocument>` component mirroring the preview layout (cover, sections, steps with slots, figure numbering).
  2. `pdf(<Document/>).toBuffer()` → upload to `public-manuals/{manual_id}/v{n}.pdf`.
  3. Store the public URL on `manual_versions.published_pdf_url` (new column via migration).
- **Public route `/manuals/:slug`** (`src/routes/manuals.$slug.tsx`): rewrite to a server route under `src/routes/api/public/manuals.$slug.ts` that 302-redirects to the stored `published_pdf_url`. Browsers will render the PDF inline with native viewer; save/download works out of the box.
- The old HTML preview route stays available at `/manuals/:slug/preview` for internal share, but the canonical public URL becomes the PDF.

### Migration
```sql
ALTER TABLE public.manual_versions
  ADD COLUMN published_pdf_url text;
```
(No grants needed — column on existing table.)

### Risk notes
- `@react-pdf/renderer` works in Cloudflare Workers (pure JS, no native). Bundle adds ~250kb to server, fine.
- If the bucket's public-buckets policy blocks creation, I'll surface that and ask the user to enable it.
- `html2canvas` PDF on the client gives a raster PDF (good fidelity, larger file). Acceptable for the "Save as PDF" button; the canonical public PDF is the vector one from `@react-pdf/renderer`.

### Out of scope
- Approver vs publisher role split (you chose same-user).
- ZIP CSV manifest (you chose filename-as-caption).
- Print stylesheet polish beyond what the new renderer needs.

Ship order: 4 → 1 → 2 → 3 (preview fix first, then PDF button) → 5 → 6. Each step verified in the preview before moving on.