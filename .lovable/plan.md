## Goal

Redesign the `MasterManualPreview` output (the DOM that html2canvas + jsPDF snapshots into the published PDF) to match the attached mockup, for the ThumperFab Master template only. Steps/Installation content is unchanged — only the surrounding chrome, cover, parts/tools page, and warning styling change.

## 1. Assets + fonts

- Upload `TF-PDF-Header.svg` and `TF-PDF-Logo.svg` to the CDN via `lovable-assets` and store the resulting `.asset.json` pointers under `src/assets/`. These become the default header + logo for the ThumperFab Master template.
- Extend `BrandingTokens` (`src/lib/branding.ts`) with:
  - `header_svg_url: string` (default = uploaded header asset URL)
  - `logo_svg_url: string` (default = uploaded logo asset URL — used on interior pages)
  - Keep `logo_url` as-is for backward compat.
- Add "Teko" via `<link>` in `src/routes/__root.tsx` head (`Teko:wght@500;600`) — Google Fonts, per Tailwind v4 rules (never `@import` in `styles.css`).
- Extend `EditBrandingDialog` "Identity" tab with two new file/URL fields: **Cover header SVG** and **Interior logo SVG**, both supporting URL paste (upload wiring can reuse `manual-assets` bucket via existing signed-URL flow — small addition, low risk).

## 2. New renderer: `ThumperFabMasterPreview`

Create `src/components/manual/ThumperFabMasterPreview.tsx`. `MasterManualPreview.tsx` becomes a thin dispatcher that returns the new renderer when `template.slug === "thumperfab-master"` (or the template's `branding.variant === "thumperfab-master"`), otherwise falls back to the current renderer. Every other template keeps its existing look, per your answer.

The new renderer uses fixed 816×1056 px pages (8.5×11 @ 96dpi), same as today, so the html2canvas → jsPDF pipeline continues to work with zero changes to `products.$productId.tsx`.

### Page 1 (cover)

```
[ TF-PDF-Header SVG — full content width, ~140px tall ]

Make/Model         Teko SemiBold 24pt  #ed1c24     (from meta.name)
Product Name       Teko Medium    22pt  #000000    (from meta.variant)
SKU: XXXXX         Arial          11pt  #000000

[ hero image — full content width, centered, letterboxed ]
  source: content.hero_image_url  (Odoo cover or user upload)

...spacer flex...

[ footer, centered ]
Thumper Fab                          Arial Black 10pt #000
5103 Elysian Fields Rd, ...          Arial 10pt #000
Customer Service: 903-472-0928       Arial 10pt #000
www.thumperfab.com                   Arial 10pt #ed1c24

Ver. X                               Arial Bold 12pt #000, right-aligned
```

### Page 2 (Parts / Tools / BOM images) — two-column throughout

Grid: two columns 50/50 with a small gutter. Both columns flow independently, so if parts overrun the tools column the pages continue side-by-side across subsequent sheets.

```
+------------------------------+------------------------------+
| Interior header (see §3)                                      |
+------------------------------+------------------------------+
| PARTS  (red bar heading)     | TOOLS  (red bar heading)     |
| REF | QTY | HARDWARE table   | · tool 1                     |
| ...                          | · tool 2                     |
|                              |                              |
| Hardware Kit (sub-heading)   |                              |
| A/B/C rows                   |                              |
+------------------------------+------------------------------+
| BOM images grid (spans both cols)                             |
|  [REF] [image thumb]  [REF] [image thumb] ...                 |
|  drawn from part_catalog images keyed by SKU + REF letter/no. |
|  overflows onto additional pages as needed                    |
+------------------------------+------------------------------+
| Warnings block (centered)    (see §4)                         |
+---------------------------------------------------------------+
| Interior footer (see §3)                                      |
```

Parts + Hardware Kit render as one continuous left column so REF numbering flows naturally. Cleaner table styling than current: tighter row height, single 1px `#000` grid, red header row with white text, no zebra, `Hardware Kit` shown as a full-width sub-header row inside the same table.

The BOM images grid uses `PartCatalogLookup` (already wired). Each cell shows the REF label (bold, boxed) next to the thumbnail so it matches the mockup's A/B/C/D/E/F layout.

### Interior pages (page 2+, including installation steps)

```
+---------------------------------------------------------------+
| Make/Model       Teko SemiBold 24pt #ed1c24  |                |
| Product Name     Teko Medium    22pt #000    | [TF-PDF-Logo]  |
| SKU: XXXXX       Arial          11pt #000    |  right-aligned |
|---------------------------------------------------------------|
|   4px solid black horizontal line, full width                 |
|                                                               |
|   ...page content (installation steps unchanged)...           |
|                                                               |
|---------------------------------------------------------------|
| SKU (left)     Product + " Install Manual" (center)   Page N  |
+---------------------------------------------------------------+
```

Page numbers: rendered as CSS counters on the printable stack, or via a small React counter that indexes each page wrapper (since jsPDF splits by canvas slicing, actually derive them from the wrapper index at render time — same trick the current preview would need; safe because the DOM order === page order).

## 3. Warnings (styled)

Replace the current `content.warnings` block. Each warning has a header row (severity title in bold caps) and a body row:

- **Info** — light blue bg `#DFF1FA`, title `#0C5A8F`, body `#111`
- **Caution** — light amber bg `#FFF4CE`, title `#8A6100`, body `#111`
- **Danger** — solid red bg `#ed1c24`, title + body white

Titles default to `INFO`, `CAUTION`, `DANGER` but each warning can carry an override `title` (add optional `title?: string` to the warning type in `src/lib/types.ts`; existing rows keep working via defaults).

Placement: bottom of page 2 content, centered as in the mockup. Renders once — not repeated per interior page.

## 4. Tables — cleanup

- Fixed column widths (REF 48px, QTY 48px, HARDWARE fills rest).
- Uniform 6px vertical / 10px horizontal padding, 1px `#111` borders, header row `#ed1c24` bg + white Teko SemiBold caps.
- Tools list: same visual weight as parts table cells (13px Arial), single column bulleted list, no two-column split.
- Hardware Kit rendered as a sub-header row inside the Parts table (single continuous table, not two side-by-side tables) so REF/QTY columns align.

## 5. Branding dialog

Add the two SVG fields to the Identity tab so the user can swap header/logo per template. Wire an "Upload SVG" button next to each URL input that reuses the existing `manual-assets` signed upload flow (mirroring how `uploadPartCatalogImage` works). No new bucket, no new server function scope beyond a tiny `uploadTemplateAsset` fn that accepts base64 + returns a signed URL.

## 6. Files touched

Created:

- `src/assets/tf-pdf-header.svg.asset.json`
- `src/assets/tf-pdf-logo.svg.asset.json`
- `src/components/manual/ThumperFabMasterPreview.tsx`
- `src/lib/template-assets.functions.ts` (single `uploadTemplateAsset` server fn)

Edited:

- `src/lib/branding.ts` — add `header_svg_url`, `logo_svg_url` fields + defaults
- `src/lib/types.ts` — add optional `title?: string` to warning
- `src/components/manual/MasterManualPreview.tsx` — dispatch to new renderer when template is ThumperFab Master; keep current implementation as the fallback
- `src/components/templates/EditBrandingDialog.tsx` — two new SVG fields + upload buttons
- `src/routes/__root.tsx` — Teko Google Font `<link>` (preconnect + stylesheet)

Untouched:

- `src/routes/_authenticated/products.$productId.tsx` publish flow (still snapshots `#manual-pdf-source` via html2canvas + jsPDF)
- Installation steps rendering (`StepLayoutView`)
- All other templates

## Open items / small risks

- **Detecting the ThumperFab Master template**: I'll dispatch on a stable marker. If the template row has `slug`/`key` we use that; otherwise I'll add `branding.variant: "thumperfab-master"` and set it on the built-in template row via a small migration. I'll confirm the schema when I open `templates.functions.ts` during build.
- **Page-number rendering** inside html2canvas: I'll number pages by wrapping each `pageBase` div and using its index — deterministic because the DOM order matches the sliced pages.
- **Warning title field**: existing manuals have no `title`, so I default per severity. No data migration needed.