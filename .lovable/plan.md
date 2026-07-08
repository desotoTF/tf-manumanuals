I understand the issue: the current renderer is falling back because it depends on `__l5e` asset URLs and client-side SVG fetches. That is fragile, especially with the second Git push/build using a separate backend/database and a different app origin.

## What I will change

1. **Stop relying on `__l5e` URLs for PDF headers**
   - The root for those URLs is the current app origin, e.g. preview would be:
     `https://id-preview--9ef353a3-ccb6-4767-99d7-c0cf84e7bb5c.lovable.app/__l5e/assets-v1/...`
   - But that URL strategy is not safe for the second non-Lovable build, so I will not make the fix depend on it.

2. **Use the SVGs you uploaded as the actual template header assets**
   - Use `TF-PDF-Header-2.svg` for the cover/page-1 header.
   - Use `TF-PDF-Logo-2.svg` for secondary page headers unless you prefer a full secondary header band later.
   - Store SVG markup directly inside the master template `branding` JSON so it renders inline with no fetch, no CORS, no CDN root, and no asset migration dependency.

3. **Add template editor upload/replace controls**
   - In the template branding editor, replace the raw URL-only fields with two upload controls:
     - Cover page header asset
     - Secondary page header asset
   - Accept SVG and raster images (`svg`, `png`, `jpg`, `webp`).
   - SVGs will be stored/rendered inline. Raster images will be stored as small data URLs in template branding with file-size validation to avoid bloating the DB.
   - Include clear Replace and Remove actions for each.

4. **Make the renderer asset-type aware**
   - If template branding has inline SVG markup, render it directly.
   - If it has an uploaded raster data URL, render it as an image.
   - Only use the built-in fallback when no template asset exists.
   - Respect `header.show` so inner headers do not silently disappear.

5. **Fix Save as PDF / local export**
   - Add an export preflight that waits for images/SVGs/fonts before calling `html2canvas`.
   - Normalize header assets to inline/data assets before capture so headers cannot taint or disappear.
   - Improve the error message to show the real export error instead of only “Check the console.”
   - Verify by opening the preview and running the export path; I will not report success unless the rendered preview shows your uploaded header SVGs and PDF export completes.

6. **Handle the two-build / two-database relationship correctly**
   - No table migration should be needed because `manual_templates.branding` already exists in both the Lovable backend and the external backend catch-up migration.
   - The key difference is data: each backend has its own `manual_templates` rows and branding JSON.
   - After this change, the header assets live in the template branding row of whichever backend the app is connected to. That means the Lovable preview DB and the external DB can each have their own uploaded headers, and the app will not depend on Lovable CDN paths working in the second deployment.

## Confirmation from current code

- The existing project already has Lovable asset pointers for:
  - `tf-pdf-header.svg`
  - `tf-pdf-logo.svg`
- Those are not reliable for the second deployment because they are relative `__l5e` asset paths.
- The uploaded files you just provided should be treated as the source of truth for this fix.

## Files I expect to touch

- `src/lib/branding.ts`
- `src/components/manual/MasterManualPreview.tsx`
- `src/components/templates/EditBrandingDialog.tsx`
- `src/routes/_authenticated/products.$productId.tsx`
- Possibly `src/lib/templates.functions.ts` only if upload validation needs to run server-side; otherwise no backend schema changes.

## Verification before saying it works

- Confirm the template editor preview uses the uploaded SVGs, not fallback art.
- Confirm a real manual preview uses the uploaded SVGs on page 1 and secondary pages.
- Confirm Save as PDF completes without the current error.
- Confirm the approach is compatible with the second Git push / external DB because the assets are stored in `branding` JSON, not Lovable-only asset URLs.