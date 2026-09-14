# Cover image + video stills for video-created manuals

Two gaps in the Docsie flow: the first-page product photo never appears, and the frames Docsie pulls out of the video don't reliably land in the manual's image library.

## 1. Cover photo from Odoo

Today the Odoo product photo is only fetched when someone clicks the "Use Odoo image" control on the cover card inside the manual editor. Nothing fetches it when a manual is created, so a manual built from a video opens with an empty cover.

Change: when a manual is created (both the normal path and the video path), try to pull the Odoo product photo in the background and set it as the cover image.

- If the product isn't linked to Odoo, or Odoo has no photo on that item, the cover just stays empty as it does now — no error shown, and the manual editor still offers the manual upload and "Use Odoo image" buttons.
- Falls back to nothing else automatically; the user can still upload or pick a video still.

## 2. Video stills from Docsie

What we can confirm from the code: Docsie returns a markdown document, and we pull out every image reference in it. When sections are built, only the first image of each section is imported — any additional frames are discarded, and frames belonging to sections the user unchecks are lost entirely.

What we cannot yet confirm: whether Docsie's response for your specific job actually contained frames at all, and whether extra frames are exposed in the structured part of the response rather than the markdown. No import jobs exist in the database this environment can read (your live jobs run against the separate Thumper Fab database), so step one is to capture that.

Plan:

1. **Capture the raw response.** Log/store the full Docsie result for the next import and inspect which fields carry images (markdown references, a screenshots/frames array, or asset URLs in the structured data). If Docsie requires a submit flag to produce frames, set it.
2. **Import every image, not just one per section.** All frames found in the result get downloaded into the manual's image library at import time, tagged as coming from the video, so they're available to attach to any step later — independent of which sections the user keeps.
3. **Show it in the review screen.** The review step gains a count of images found and a note that they'll all be added to the manual's image library; each section still gets its first frame auto-placed as today.

## Technical notes

- `src/lib/manuals.functions.ts`: after creating the manual/version in `createManualFromSku`, attempt `fetchOdooCoverImage`'s logic (extract into a shared helper) and write `hero_image_url` into the draft content; swallow failures.
- `src/lib/docsie.functions.ts`: in `getImportJob`, persist the complete result payload; in `applyVideoImport`, run `importImage` over the full de-duplicated image list (not just `chapter.images[0]`) so every frame becomes a `manual_assets` row, keeping the per-section first-image placement.
- `src/lib/docsie-markdown.ts`: also surface images that appear before the first `##` heading so intro frames aren't dropped.
- `src/lib/docsie.server.ts`: add any submit parameter needed for frame extraction once confirmed against a live job.

## Open item

After this ships, run one video import and send me the section count and image count reported on the review screen — that confirms whether Docsie is returning frames for your videos, or whether the stills need to be requested differently.
