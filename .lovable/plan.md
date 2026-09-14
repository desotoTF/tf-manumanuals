# Docsie video-to-manual integration

Add Docsie as an optional, per-organization module. When it's switched on, the Create manual overlay gains a "Create from" choice: keep the normal manual build, or paste a YouTube URL and let Docsie turn the video into draft manual sections.

## What the user experiences

**Settings → Integrations (new page, admin/owner only)**
- Card per available module. First one: Docsie (Video to docs).
- Toggle on/off, plus a field for the Docsie API key and optional workspace ID.
- "Test connection" button confirms the key works before saving.
- The key is stored encrypted in the vault, exactly like the ERP credentials — never shown again after saving, only "Replace key" / "Remove".

**Create manual overlay**
- A "Create from" dropdown appears at the top *only* when at least one automated module is enabled. Default: "Manual creation" (today's behavior, unchanged).
- Choosing "Video (Docsie)" reveals a required "Video URL (YouTube)" field. The URL is validated as you type (recognized YouTube link) and re-checked server-side on submit; a bad or private/unavailable link blocks creation with a clear message.
- SKU and product name behave exactly as today (SKU required, Odoo lookup fills the name). If Odoo returns nothing, we offer Docsie's generated title as the name once processing finishes, so the SKU + name format stays intact.
- On submit the overlay switches to a progress panel: video validated → submitted → analyzing → writing sections → done, with a percentage bar and elapsed time. The job keeps running if the user closes the overlay; the manual shows as "Importing from video" in the list and reopening it resumes the same progress view.
- At 100% we go straight to a **review screen** listing every chapter Docsie produced, each with a layout dropdown pre-filled with our best guess (text-only, image + text, two-column). The user can change layouts, drop chapters, and reorder before hitting "Build manual". Tools/hardware/BOM sections stay empty, filled in manually as before.

## Technical approach

**Docsie API** (verified against `app.docsie.io/schema/video/`, `/api_v2/003/`):
- `POST /video-to-docs/submit/` with `video_url`, `quality`, `doc_style: "guide"`, `auto_publish_to_knowledge_base: false`, `intent: "export"` → returns `job_id`.
- `GET /video-to-docs/{id}/status/` → `normalized_status`, `can_poll`, `error`.
- `GET /video-to-docs/{id}/result/` → `title`, `markdown`, structured `data`, extracted image URLs.
- Auth header format is confirmed against a live key during the first build step.

**Storage**
- New table `integration_connections` (org_id, provider enum `docsie`, is_active, workspace_id, vault_secret_id, last_test_at/status) + RLS mirroring `erp_connections`, with GRANTs and vault helper functions modeled on `erp_store_credentials` / `erp_read_credentials`.
- New table `manual_import_jobs` (org_id, product_id, manual_id nullable, provider, source_url, external_job_id, status, progress, error, raw_result jsonb) so progress survives page reloads and a second user can see it.

**Server functions** (`src/lib/docsie.functions.ts`, helpers in `docsie.server.ts`)
- `listEnabledImportModules`, `saveDocsieConnection`, `testDocsieConnection`, `removeDocsieConnection`.
- `validateVideoUrl` — shape check plus a YouTube oEmbed reachability probe.
- `startVideoImport` — creates product + manual draft in an `importing` state, submits to Docsie, records the job.
- `getImportJob` — polled every ~5s by the overlay; proxies Docsie status server-side so the API key never reaches the browser.
- `applyVideoImport` — takes the reviewed chapter/layout mapping and writes the manual content, downloading Docsie's images into our manual assets storage so they don't depend on remote URLs.

**Markdown → manual content**
A converter splits Docsie's markdown on `##` headings into chapters, maps paragraphs/lists to our rich-text step bodies, and attaches the first image of each chapter as the step image. Default layout guess: image + text when the chapter has an image, text-only otherwise.

**Files touched**
- new: migration, `src/lib/docsie.functions.ts`, `src/lib/docsie.server.ts`, `src/lib/docsie-markdown.ts`, `src/routes/_authenticated/settings.integrations.tsx`, `src/components/manual-editor/ImportReviewDialog.tsx`
- edited: `src/routes/_authenticated/products.tsx` (Create manual overlay + progress panel + "Importing" row state), `src/components/AppSidebar.tsx` (Integrations link), `src/lib/manuals.functions.ts` (import-state manual creation)

## Notes / open items

- You'll need to create the Docsie API key (Developer → API Keys, "Video-Docs only" scope is enough) when we start; I'll request it through the secure secret form.
- Docsie jobs consume Docsie AI credits. I'll surface the credit balance on the Integrations card so nobody is surprised by a failed job.
- A sample YouTube URL you've already run through Docsie would let me tune the chapter→layout mapping to real output rather than guesses.
