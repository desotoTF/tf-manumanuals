## 1. Image editor: crop saves a different region than shown

**Root cause:** `ImageEditorDialog` renders the "background" as a plain `<img src={imageUrl}>` sitting behind the Fabric canvas. Fabric never actually holds the image — it's overlay-only. So:

- The crop rectangle is drawn against the `<img>` visually, but the crop math uses the fabric canvas coordinates. Any mismatch between the img's rendered box and the canvas (rounding, DPR, style vs attribute size) shifts sx/sy.
- After Apply crop, we swap `originalImageRef` to the cropped bitmap and resize the canvas — but the `<img>` tag still shows the *original* `imageUrl` at the new size, so the on-screen preview is squished/mis-cropped and doesn't reflect what Save will actually write.
- On Save, `ctx.drawImage(originalImageRef, ...)` uses the (possibly re-cropped multiple times) reference plus the overlay scaled by `sourceWidth / displayWidth`. When displayWidth was recomputed from a different scale than the source, the overlay scale is wrong and the composited output shows "a whole different section."

**Fix:** make the Fabric canvas the single source of truth for what the user sees.

- Remove the sibling `<img>` element. Load the source image into Fabric as `canvas.backgroundImage` (via `fabric.FabricImage.fromURL`) scaled to fit `MAX_W × MAX_H`.
- Crop workflow: compute sx/sy/sw/sh from the crop rect against the *background image's* current scale (`backgroundImage.scaleX/scaleY`), draw to an offscreen canvas at source pixels, then set the resulting bitmap as the new background image and resize the fabric canvas to the new fitted dimensions. Update `originalImageRef` to the cropped bitmap so subsequent crops/saves are consistent.
- Save workflow: export via `canvas.toDataURL({ multiplier: sourceWidth / canvas.getWidth(), enableRetinaScaling: false })`. Because the background image is now inside the canvas, this single export produces the final composited PNG at source resolution — no separate `drawImage(originalImage) + overlay` step, which eliminates the scale mismatch.
- Keep `enableRetinaScaling: false` and the existing `devicePixelRatio: 1` config.

Verification: launch Playwright, open a product step's image editor, draw a crop rect over a known corner, Apply, Save, and diff the saved blob against the expected region using `PIL`.

## 2. Per-image size control in step layouts

Currently `StepSlot` has `{ text_html, asset_id, caption, callout }` and the view renders the image at whatever width the slot column gives it. Add an explicit width percentage per slot.

**Data model** (`src/lib/types.ts`):
- Extend `StepSlot` with `image_width?: ImageWidth` where `ImageWidth = 25 | 50 | 60 | 75 | 80 | 100`.
- Default = `100` (current behavior) so existing manuals render unchanged.
- Export `IMAGE_WIDTH_OPTIONS = [100, 80, 75, 60, 50, 25]` for reuse.

**Editor** (`src/components/manual-editor/StepLayoutEditor.tsx`):
- Next to each slot's image thumbnail / upload control, add a compact `Select` (shadcn) labeled "Image size" with the six options. Only shown when `slot.asset_id` is set.
- Persist by updating `slot.image_width` through the existing slot-update path.

**View** (`src/components/manual/StepLayoutView.tsx` and the PDF preview in `MasterManualPreview.tsx`):
- Wrap the rendered image in a container with `style={{ width: `${image_width ?? 100}%` }}` and `mx-auto` so it stays left-aligned inside the slot but shrinks predictably. Caption stays under the image at the same width.
- No change to layout column widths — this only shrinks the image within its slot, letting the text below reflow up naturally.

**Migration:** none needed. `normalizeStep` already tolerates missing slot fields; the width falls back to 100.

## Files touched

- `src/components/manual-editor/ImageEditorDialog.tsx` — rework background handling, crop, and save paths.
- `src/lib/types.ts` — add `image_width` to `StepSlot`, add `IMAGE_WIDTH_OPTIONS`.
- `src/components/manual-editor/StepLayoutEditor.tsx` — width dropdown per image slot.
- `src/components/manual/StepLayoutView.tsx` — apply width to rendered image + caption wrapper.
- `src/components/manual/MasterManualPreview.tsx` — same width wrapper in the PDF preview render path (if it uses its own image renderer rather than `StepLayoutView`).
