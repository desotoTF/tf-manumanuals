## Goal

Create one editable "master template" for ThumperFab, seeded by hand from the reference PDF (`TF292001 Defender HD11 Long Travel INSTALL`). The template defines cover layout, header/footer, fonts, colors, and parts-table styling for every manual. No general PDF-to-template tool — this is a one-time seed. Admins can edit all of it afterward in Settings → Templates, and both the on-screen manual preview and PDF export render through it.

## Branding extracted from the PDF

- Logo: black + red angular "AF/TF" mark next to wordmark
- Brand red: ~`#E11D2A` (title text, web URL, divider dots, table-header band)
- Ink black: ~`#111111` (body/headings)
- Body gray: ~`#4B4B4B` (sub-text, footer)
- Headings: condensed sans-serif (close free match: **Barlow Condensed** for titles, **Barlow** for body)
- Cover: top logo lockup → red H1 product name → black H2 variant → "SKU: …" → hero image → centered footer block (company, address, phone, `www.thumperfab.com`, "Ver. …")
- Inner pages: top header strip with product name / variant / SKU; numbered steps with photos; PARTS / HARDWARE KIT / TOOLS tables with red header band, white text
- Back cover mirrors the front lockup

## Data model (one migration)

Extend `manual_templates` with a single `branding jsonb` column (default `{}`), so we don't fragment the schema. Shape:

```json
{
  "logo_url": "...",
  "colors": { "brand": "#E11D2A", "ink": "#111111", "muted": "#4B4B4B", "tableHeaderBg": "#E11D2A", "tableHeaderFg": "#FFFFFF" },
  "fonts":  { "heading": "Barlow Condensed", "body": "Barlow", "headingWeight": 700, "bodyWeight": 400 },
  "cover":  { "tagline": "Aluminum Audio Roofs • Roll Cages • UTV Accessories", "showHero": true, "versionLabelPrefix": "Ver." },
  "header": { "show": true, "showSku": true },
  "footer": { "companyName": "Thumper Fab", "address": "5103 Elysian Fields Rd, Marshall, TX 75672", "phone": "903-472-0928", "website": "www.thumperfab.com" },
  "tables": { "partsHeaderUppercase": true, "zebra": false, "borderColor": "#111111" }
}
```

Plus a boolean `is_master boolean default false` so we can mark + look up the single ThumperFab master quickly. Migration also seeds one row: `name = "ThumperFab Master"`, `is_master = true`, `branding = {…above…}`, scoped to the ThumperFab org.

## Logo asset

Crop the wordmark+icon out of page 1 of the reference PDF, upload via `lovable-assets`, store the resulting CDN URL in `branding.logo_url`. Editable later by uploading a new logo (reuses existing `manual-assets` bucket).

## Rendering — shared layout component

New `src/components/manual/MasterLayout.tsx` consumes `branding` + manual content. Two adapter wrappers:

1. `WebManualPreview` — used on the manual detail page; renders semantic HTML styled with Tailwind, but pulls all colors / fonts / strings from `branding` via inline style + CSS vars (no hard-coded hex/font names).
2. `PdfManualDoc` — uses `@react-pdf/renderer` (works in the Worker SSR runtime) to render the same structure with matching tokens for the PDF export path. Fonts loaded via `Font.register` from Google Fonts (Barlow / Barlow Condensed).

Both reuse the same section components (Cover, Header, Footer, PartsTable, ToolsList, StepBlock, Disclaimer, BackCover) so visual edits to `branding` show up identically in web and PDF.

Hook points:
- Web preview: `products.$productId.tsx` swaps current ad-hoc rendering for `<WebManualPreview branding={masterTemplate.branding} manual={…} />`.
- PDF export: existing export server fn loads the master template row and renders `PdfManualDoc` → returns PDF bytes.

## Editor UI (Settings → Templates)

In `settings.templates.tsx`, add an "Edit Branding" button on the master template row that opens a dialog with fields grouped:

- **Identity**: logo upload, company name, tagline
- **Colors**: 5 color pickers (brand, ink, muted, table header bg/fg) with live swatches
- **Typography**: heading font, body font (dropdown of supported Google fonts: Barlow Condensed, Oswald, Bebas Neue, Roboto Condensed, Inter, Roboto, Source Sans 3), weight selectors
- **Footer**: address, phone, website, version label prefix
- **Cover**: show/hide hero, version label prefix
- **Tables**: uppercase headers toggle, zebra toggle, border color

Save persists the `branding` JSON. A small "Preview" pane on the right renders a thumbnail of the cover + one inner page using `WebManualPreview` so admins see changes immediately.

## Files

- `supabase/migrations/<ts>_master_template_branding.sql` — add columns + seed row
- `src/lib/templates.functions.ts` — add `getMasterTemplate`, `updateTemplateBranding`
- `src/components/manual/MasterLayout.tsx`, `WebManualPreview.tsx`, `PdfManualDoc.tsx`, plus section subcomponents
- `src/components/templates/EditBrandingDialog.tsx`
- `src/routes/_authenticated/settings.templates.tsx` — new button + dialog wiring
- `src/routes/_authenticated/products.$productId.tsx` — swap renderer to `WebManualPreview`
- PDF export server fn — render `PdfManualDoc`
- `bun add @react-pdf/renderer` (Worker-compatible)

## Out of scope

- Generic PDF→template extractor (explicitly rejected)
- OCR / image extraction from the reference PDF beyond the cropped logo
- Per-manual branding overrides (every manual uses the master for now; we can add overrides later if needed)
