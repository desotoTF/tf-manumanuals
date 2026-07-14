## Add two new pages to Master Manual template

### 1. Data / branding

**`src/lib/branding.ts`** — extend `BrandingTokens`:
- Add `disclaimer: { title: string; body: string }` with the full Thumper Fab disclaimer text as the default (title: `"PRODUCT DISCLAIMER"`, body: the paragraph you provided).
- Add `backCover: { show: boolean }` (default `true`) so the page can be toggled off.
- Merge in `mergeBranding` alongside the other groups.

**TF logo asset** — upload `user-uploads://TF-Logo-w-Text.svg` via `lovable-assets` to `src/assets/tf-logo-wordmark.svg.asset.json`, plus a raw `?raw` import for inline SVG rendering (matches how `tf-pdf-logo-2.svg` is handled today). Reference from `branding.ts` only as a hardcoded default (not user-editable per your answer).

### 2. Editor UI

**`src/components/templates/EditBrandingDialog.tsx`** — add a new "Disclaimer" section with:
- Text input for `disclaimer.title`
- Textarea (large, ~12 rows) for `disclaimer.body`
- Checkbox: "Show back cover page"

Back cover contact info reuses existing `footer.companyName / address / phone / website` fields — no new inputs (per your answer).

### 3. PDF rendering

**`src/components/manual/MasterManualPreview.tsx`**:
- Change `totalPages` from `2 + stepsPages.length` to `2 + stepsPages.length + (disclaimer ? 1 : 0) + (backCover ? 1 : 0)`.
- After the steps `.map(...)`, render:
  - **Disclaimer page** — uses the existing `InteriorFrame` (same header/footer/page-number chrome as steps). Body: `<h2>` with `disclaimer.title` in brand color/heading font, followed by justified paragraph(s) of `disclaimer.body` (split on blank lines) at small body size so it fits one page.
  - **Back cover page** — plain `data-manual-page` div (NO `InteriorFrame`, matching page 1 cover style). Layout matches your screenshot:
    - Vertically centered TF logo+wordmark SVG (~50% page width, capped)
    - Below logo: bold `footer.companyName`, then `footer.address`, then `Customer Service: {footer.phone}` (centered, black)
    - Near bottom: `footer.website` in brand red, centered
- Page numbering: disclaimer gets `totalPages - 1`, back cover gets `totalPages` (last).

### 4. Files touched

- `src/lib/branding.ts` — add disclaimer + backCover tokens, defaults, merge
- `src/assets/tf-logo-wordmark.svg.asset.json` (new, via lovable-assets)
- `src/components/templates/EditBrandingDialog.tsx` — new Disclaimer section
- `src/components/manual/MasterManualPreview.tsx` — render two new pages, update `totalPages`

No DB migration needed (branding is JSONB; `mergeBranding` fills defaults for existing templates).
