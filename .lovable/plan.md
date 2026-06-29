## Goals

1. Fix Odoo auth (no API key needed) so SKU lookups + BOM sync work.
2. Replace the product-picker Create Manual dialog with a SKU-driven flow that auto-fills name from Odoo and silently upserts a `products` row.
3. Scaffold a pages/blocks content model so the editor can support per-page layout modules later.
4. Add a dynamic `Fig. X` counter on image blocks plus `##Fig.` references in text that update on insert/reorder/delete (strike + warn on deletion).

---

## 1. Odoo auth: session-based JSON-RPC

Research confirms Odoo Online's 1-day API key limit is a v18 security change for non-admin users, AND on the Standard plan XML-RPC is plan-gated. The only path that works in both cases is the `/web/session/authenticate` endpoint (the same one the browser uses).

**Changes**

- Add `OdooClient` (session mode) in `src/lib/odoo-session.server.ts`:
  - `POST /web/session/authenticate` with `{ db, login, password }` → capture `session_id` cookie.
  - `callKw(model, method, args, kwargs)` → `POST /web/dataset/call_kw` with the cookie.
  - On 401/403, re-authenticate once and retry.
- Extend `erp_connections` to support an auth mode:
  - New nullable column `auth_mode TEXT DEFAULT 'api_key' CHECK (auth_mode IN ('api_key','session'))`.
  - Vault payload for session mode stores `{ password }` instead of `{ api_key }`.
- Settings → ERP page: add an "Auth method" radio (API key / Password — session). Password mode shows a 2FA warning (sessions break if 2FA is on the user). Recommend a dedicated read-only Odoo user. - YES, let's not touch the ERP Odoo integration right now. I'll get our odoo admin to create a dedicated read-only account. I'll use a 1 day api token for testing right now.
- Replace existing `authenticate()` path in `odoo-xmlrpc.server.ts` to dispatch by `auth_mode`: keep XML-RPC for `api_key`, route to session client for `password`. Sync code stays the same — both clients expose `searchRead`.
- Surface the raw Odoo fault message in `Sync failed: …` (currently swallowed into "no uid").
- Add a **Test connection** button in Settings → ERP that does one `read` on `res.users` and returns the actual error.

DB migration #1 — `auth_mode` column + comment.

---

## 2. Create Manual: SKU-first flow

Replace the current product-picker dialog with a 3-step flow inside the same dialog.

**Step 1 — SKU**

- Single input. On blur / Enter, call new `lookupProductBySku({ organizationId, sku })` server fn:
  - First check local `products` table by `sku` + `organization_id` → if found, return it.
  - Otherwise call Odoo via the active ERP connection: `product.product` `search_read [['default_code','=',sku]]` fields `['id','default_code','name','display_name']`.
  - Return `{ source: 'local'|'odoo'|'not_found', sku, name, odooProductId? }`.
- Show resolved Name in an editable input below the SKU field. User can override.

**Step 2 — Template**

- Same template `Select` as today (default + blank options).

**Step 3 — Confirm**

- Submit calls new `createManualFromSku({ organizationId, sku, name, templateId? })`:
  - Upserts `products` row (`organization_id`, `sku`, `name`, `odoo_product_id` if known, `is_active=true`).
  - Reuses existing `createManualDraft({ productId, templateId })`.
  - Returns `{ productId, manualId }` and the UI navigates to `/products/$productId`.

**Manual title everywhere** = `formatManualLabel(sku, name)` (already exists).

**Files touched**

- `src/lib/odoo-session.server.ts` (new)
- `src/lib/products.functions.ts` — add `lookupProductBySku`, keep existing fns.
- `src/lib/manuals.functions.ts` — add `createManualFromSku`.
- `src/routes/_authenticated/products.tsx` — rewrite `CreateManualDialog` (remove product picker, add SKU + lookup state machine). Drop `listProductsWithoutManual` import.
- `src/routes/_authenticated/settings.erp.tsx` — auth mode toggle + Test connection button.

---

## 3. Pages + blocks content model

Extend `ManualContent` (in `src/lib/types.ts`) without breaking existing manuals.

```ts
type BlockKind = 'text' | 'image' | 'parts' | 'hardware_kit' | 'tools'
              | 'warnings' | 'torque' | 'steps';

interface BaseBlock { id: string; kind: BlockKind; }
interface TextBlock      extends BaseBlock { kind: 'text'; body: string; }
interface ImageBlock     extends BaseBlock { kind: 'image'; asset_id: string; caption?: string; }
// other kinds wrap existing arrays (parts/tools/etc.) so legacy content maps in cleanly

type PageLayout =
  | 'single'                 // 1 block, full width
  | 'image_text_v'           // image over text
  | 'image_text_h'           // image | text side-by-side
  | 'two_image_text'         // 2x(image+text)
  | 'two_image_text_vertical'; // image+text stacked twice

interface ManualPage { id: string; layout: PageLayout; blocks: Block[]; }

interface ManualContent {
  pages: ManualPage[];
  // legacy fields kept for back-compat read; new editor writes only pages
  tools?: Tool[]; parts?: ManualPart[]; hardware_kit?: ManualPart[]; /* … */
}
```

**Migration of in-memory content** (no DB migration needed — content is JSONB):

- On load, if `content.pages` is missing, synthesize a single page from the legacy flat arrays so the editor never crashes on existing drafts.
- On save, always write `pages` (and re-derive the legacy arrays from page blocks so any old reader keeps working until we remove them).

**Editor work (this round, minimum viable)**

- Page list (left rail) with reorder.
- Per-page **layout picker** (Select of the 5 layouts above) — slot count derives from layout.
- Within a page, render slots; each slot accepts a typed block (text / image for now; parts/tools/etc. wired in next round).

The full block UI ships incrementally — this round lands the data model + layout picker + text/image blocks so Fig. counter has something to attach to.

---

## 4. Figure counter + ##Fig. references

**Counter**

- Compute `figureNumber` per image block by walking `content.pages` in order and counting image blocks. Pure derivation — never stored.
- Each `ImageBlock` renders `Fig. {n}` below the image. Captions stay separate from the figure label.

`**##Fig.` references in text**

- TextBlock body uses an inline token: `{{fig:<imageBlockId>}}`. Renderer replaces with `Fig. {currentNumber}`.
- Authoring: typing `##Fig.` opens a popover listing every image on the manual (`Fig. 1 — caption`, page N). Selecting one inserts the token. Implementation uses a lightweight contenteditable with a tiptap-style suggestion, or a controlled `<textarea>` + popover MVP (decide during build; prefer textarea+popover first to avoid a heavy editor swap).
- A small `useFigureMap(content)` hook returns `{ blockId → number }`. Both image labels and text tokens read from it, so add/delete/reorder updates everything in one render.

**Deletion behavior (strike + warn)**

- When an image is deleted, tokens that referenced it remain in body text but render as `~~Fig. ?~~` with a `<sup>` warning chip. The editor sidebar lists "Broken figure references (N)" with quick-jump links.
- No data fix-up on delete — preserves user intent until they decide.

**Reorder** auto-updates numbers because the map recomputes from page order every render.

---

## Technical notes

- DB migration: `ALTER TABLE public.erp_connections ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'api_key' CHECK (auth_mode IN ('api_key','session'));` (+ comment). No new tables.
- No changes to `manuals` / `manual_versions` schema — content shape evolves inside the existing `content` JSONB.
- `lookupProductBySku` and `createManualFromSku` are authenticated (`requireSupabaseAuth`); they call the org's ERP connection server-side and never expose Odoo creds to the browser.
- Session client lives in `*.server.ts`; loaded via dynamic `await import` inside handlers so it never leaks to client bundles.
- `formatManualLabel(sku, name)` stays the canonical title source.

---

## Out of scope (next rounds)

- Rich block types beyond text/image in the new editor (parts/tools/warnings/torque/steps — still authored via the legacy panels until migrated).
- WYSIWYG rich-text editor swap (Tiptap/Lexical). MVP uses textarea + popover.
- PDF render of the new pages/blocks model — current PDF path stays on legacy fields until the block UI is complete.
- "Manage Odoo users" UI inside ManuManuals.