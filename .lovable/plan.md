# Phase III-B — Shipped

## What's new

- **Manual editor** at `/products/$productId` — 3-column layout:
  - Left rail: latest BOM snapshot (first 20 items), version list.
  - Main: tabbed structured-content editor (Steps · Tools · Parts · Warnings · Torque · Images) with row reorder/add/delete.
  - Right rail: version state badge, change summary, drift warning when product is out_of_sync, state-transition buttons, link to public page after publish.
- **Version state machine**: `draft → in_review → approved → published` (older `published` auto-superseded by trigger). Editors can submit/discard; owners or admins approve/publish. Each transition logs a `sync_events` row.
- **New draft from latest**: clones content forward and re-binds to the latest BOM snapshot. First-time manual creation pre-fills `parts[]` from the BOM.
- **Image assets**: attach by URL with optional caption (private storage bucket `manual-assets` created for future direct uploads).
- **Public SSR route** `/manuals/$slug` — anyone can read the latest **published** version. Uses `supabaseAdmin` server-side, gated to `state='published' AND product.is_active`. Includes warnings, tools, parts, ordered steps, torque specs, reference images, SEO/OG metadata, lazy-loaded images.
- **Dashboard** "Open" links now jump straight to the editor.

## Server functions added
- `getProductWorkspace`, `getManualVersion`, `createManualDraft`, `saveDraftContent`, `transitionManualVersion`, `addManualAsset`, `removeManualAsset` — `src/lib/manuals.functions.ts`
- `getPublishedManualBySlug` (public, no auth) — `src/lib/public-manuals.functions.ts`

## Try it
1. Dashboard → click **Open** on a product.
2. **Create manual** → edit Steps + Parts + Warnings → **Save draft** → **Submit for review** → **Approve** → **Publish**.
3. After publish, click **View public page →** to see the SSR-rendered manual at `/manuals/<sku-slug>`.

## Not yet
- Direct image upload to the `manual-assets` bucket (currently URL-paste only).
- PDF generation (`pdf_url` field exists but is unused).
- Per-step image association (asset_ids are stored in content but the UI doesn't link them yet).
