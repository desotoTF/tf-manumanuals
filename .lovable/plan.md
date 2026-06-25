# ManuManuals — Build Plan (revised across all three phases)

A manufacturing InstallOps platform that keeps installation manuals in sync with live ERP BOM data. Built on TanStack Start (React 19 + Vite 7) + Lovable Cloud (Supabase). Multi-tenant, invite-only, Odoo-first with room for additional ERPs.

---

## Stack & cross-cutting decisions

- **Frontend/runtime:** TanStack Start (file-based routes under `src/routes/`, SSR for public pages, `createServerFn` for backend logic). Lovable's standard template — better fit than plain Vite for SSR'd manual pages and PDF endpoints.
- **Backend:** Lovable Cloud (Supabase). App-internal server logic uses `createServerFn`; webhooks/external callbacks (future) go under `src/routes/api/public/*`. Supabase Edge Functions are reserved for things that must run inside Supabase's network.
- **Auth:** Supabase Auth, email/password. **Public signup disabled.** Invite-only with token-based invite links. Org-scoped multi-tenancy with role-based access (owner/admin/editor/viewer). Roles live in a separate `user_roles`-style table per org (no role columns on profiles).
- **Secrets / ERP credentials:** Per-connection Cloud secret, name pattern `ERP_CRED_<connection_uuid>`, holding a JSON blob with the API key (and other per-provider fields). `erp_connections` row stores only a `secret_name` reference. Rotation = update the secret + bump a `credentials_version` int on the row, with an audit log entry. Revocation = delete secret + set `is_active=false`. Avoids encrypted-column footgun and scales to multi-ERP.
- **Manual content:** Structured JSON in `manual_versions.content` (typed). Canonical HTML renderer drives both web view and PDF (HTML→PDF later). PDF deferred past v1; web manual is source of truth.
- **PDF (later phase, not v1):** External HTML→PDF service (Browserless or PDFShift) called from a `createServerFn`. We'll wire the stub endpoint now so the UI has the button, but actual rendering is Phase IV.
- **Feature flag:** `public_signup_enabled` (org-level setting / env flag) so open signup can be turned on later without code changes.

---

## Phase 0 — Project bootstrap (folded into Phase I)

1. Enable Lovable Cloud.
2. Configure Supabase Auth: disable public signup at the project level; enable email confirmations off for invited users (token flow handles trust).
3. Create the `__root.tsx` shell, an unauthenticated `/auth` route (sign-in + accept-invite), and the integration-managed `_authenticated/` layout.
4. Seed a "demo org" + demo user via migration so the dashboard isn't empty on first run.

---

## Phase I — Data model, auth/org, minimal admin view

### Schema (Supabase migrations)

All tables in `public` schema get explicit `GRANT`s + RLS enabled + policies scoped via a `has_org_access(org_id)` / `has_org_role(org_id, role)` security-definer function (avoids RLS recursion).

**Auth & tenancy**

- `organizations` (id, name, slug, settings jsonb, created_at, updated_at)
- `profiles` (id = auth user id, full_name, email, created_at, updated_at) + trigger to auto-create on signup
- `memberships` (id, organization_id, user_id, created_at) — unique (org, user)
- `org_roles` (id, organization_id, user_id, role enum: owner/admin/editor/viewer) — roles separated from memberships per security guidance
- `invitations` (id, organization_id, email, role, token_hash, invited_by, expires_at, accepted_at, created_at) — token sent via email link, hash stored

**ERP**

- `erp_connections` (id, organization_id, provider enum [odoo, netsuite, dynamics365, epicor, infor, other], name, base_url, database, username, **secret_name** text, credentials_version int, is_active, last_sync_at, last_sync_status, created_at, updated_at) — **no api_key column**
- `erp_credential_audit` (id, erp_connection_id, action enum [created, rotated, revoked], actor_user_id, occurred_at, note)

**Products & BOM**

- `products` (id, organization_id, erp_connection_id nullable, erp_product_id, sku, name, description, is_active, web_slug unique per org, created_at, updated_at) — slug lives here, not on versions
- `bom_snapshots` (id, product_id, erp_connection_id, erp_bom_id, erp_bom_revision, raw_payload jsonb, normalized_items jsonb, **content_hash** text [sha256 of normalized_items], captured_at, created_at) — unique index on (product_id, content_hash) so identical BOMs don't create duplicate snapshots

**Manuals**

- `manuals` (id, product_id, title, lifecycle enum [active, archived], created_by, created_at, updated_at) — removed status enum to avoid overlap with versions
- `manual_versions` (id, manual_id, version_number int, bom_snapshot_id, state enum [draft, in_review, approved, published, superseded], content jsonb, change_summary text, pdf_url nullable, created_by, approved_by nullable, published_at nullable, created_at, updated_at) — unique (manual_id, version_number)
- `manual_assets` (id, manual_version_id, type enum [image, diagram, video_reference], storage_path, url, metadata jsonb, created_at)

**Ops & telemetry**

- `sync_events` (id, organization_id, erp_connection_id, product_id nullable, event_type enum, payload jsonb, occurred_at)
- `manual_sync_status` (id, product_id unique, current_bom_snapshot_id, latest_published_version_id nullable, status enum [in_sync, out_of_sync, no_manual, pending_review], last_bom_change_at, last_manual_publish_at, out_of_sync_since, updated_at)

**DB-level integrity (important — schema, not just app code):**

- Trigger on `bom_snapshots` insert → recompute `manual_sync_status` for the product.
- Trigger on `manual_versions` state change to `published` → set previous published version to `superseded`, update `manual_sync_status`, stamp `last_manual_publish_at`.
- Storage bucket `manual-assets` (private), path convention `org/<org_id>/product/<product_id>/version/<version_id>/<filename>`, RLS via `has_org_access`.

### Server functions (createServerFn skeletons)

- `createOrganization`, `acceptInvite(token)`, `inviteMember`, `listMyOrgs`, `setActiveOrg`
- `listProducts(orgId, filters)`, `getProduct(productId)`, `getLatestBomSnapshot(productId)`
- `manualStatusForProduct(productId)` — pure helper mirroring trigger logic for ad-hoc reads
- `nextManualVersionNumber(manualId)`
- Odoo sync stubs: `validateConnection`, `syncBoms` (Phase II fills in real logic)

### Minimal admin UI (so the model is verifiable)

- `/auth` — sign in + `/auth/accept?token=…` accept-invite flow
- `/_authenticated/` layout with org switcher in header
- `/_authenticated/products` — read-only list of products with status badges (uses seeded demo data)
- `/_authenticated/settings/team` — list members, invite by email (admins only)
- `/_authenticated/settings/erp` — empty-state with "Connect Odoo" CTA (Phase II builds the form)

**Phase I exit:** signed-in user in seeded demo org sees seeded products with their statuses; team invites round-trip.

---

## Phase II — Odoo connection + BOM sync

### Settings UI — `/_authenticated/settings/erp/odoo`

- List existing Odoo connections (name, base_url, last_sync_at, last_sync_status, "Sync now", "Rotate key", "Revoke").
- "Connect Odoo" form: name, base_url, database, username, API key (password input, write-only).
- Inline help: how to create an API key in Odoo (Preferences → Account Security → New API Key).
- Submit flow:
  1. Client calls `validateConnection` server fn with form values (API key passed once, in-memory).
  2. Server makes XML-RPC test call to Odoo.
  3. On success: write the credential blob to a new Cloud secret named `ERP_CRED_<new_uuid>`, insert `erp_connections` row referencing it, log `erp_credential_audit`.
  4. On failure: surface detailed error, store nothing.
- Rotate flow: same form, updates secret value + bumps `credentials_version`, audit entry.

### `validateConnection` server fn

- Inputs: either inline credentials (for first-time validate) or `erp_connection_id` (for re-validate).
- Calls Odoo XML-RPC `common.authenticate(db, username, api_key, {})` against `<base_url>/xmlrpc/2/common`. Hand-rolled XML envelope via `fetch` — Workers runtime can't run Node-only XML-RPC libs.
- Writes `sync_events` (`bom_sync_started` / `bom_sync_failed`).
- Returns `{ ok, uid?, error? }` — never echoes the API key.

### `syncBoms` server fn

- Inputs: `erp_connection_id`, optional `product_filter`.
- Loads credentials from the referenced Cloud secret (server-side only).
- Calls Odoo XML-RPC `object.execute_kw` against `/xmlrpc/2/object`:
  - `product.template` search_read for products in scope.
  - `mrp.bom` + `mrp.bom.line` for BOMs.
- Per product:
  1. Upsert into `products` (by `erp_connection_id` + `erp_product_id`).
  2. Normalize BOM lines into `{ part_number, qty, description, unit, notes }[]`, compute `content_hash`.
  3. If no existing snapshot with that hash → insert new `bom_snapshots`. Trigger recomputes `manual_sync_status`.
  4. Emit `sync_events` (`bom_change_detected` when new snapshot inserted).
- On completion: stamp `erp_connections.last_sync_at` + `last_sync_status`, emit `bom_sync_succeeded`, return `{ scanned, changed, in_sync, out_of_sync, no_manual }` summary.

### Security & UX

- All ERP server fns use `requireSupabaseAuth` + `has_org_role(org_id, 'admin')` check.
- API keys never returned to client. UI displays "•••• rotated 3d ago".
- Toasts for sync start/success/failure; per-connection "Last sync" timestamp + colored status dot.

**Phase II exit:** an org can connect Odoo, run "Sync now", see products + BOM snapshots populated, and watch `manual_sync_status` flip correctly.

---

## Phase III — InstallOps dashboard + manual editor shell + super-admin console

### Super-admin foundations (already shipped, recap)

- `platform_roles` table + `platform_role` enum (currently: `super_admin`), separate from per-org `org_roles` so org RLS stays uncoupled.
- `has_platform_role(user, role)` + `is_super_admin()` security-definer helpers.
- "Super admin full access" RLS policies on `organizations`, `memberships`, `org_roles`, `invitations`, `products`, `bom_snapshots`, `manuals`, `manual_versions`, `manual_assets`, `manual_sync_status`, `erp_connections`, `erp_credential_audit`, `sync_events`.
- ERP Vault RPCs (`erp_store_credentials`, `erp_read_credentials`, `erp_delete_credentials`) accept super_admin as authorized caller.
- Bootstrap endpoint seeds `desotod@gmail.com` (org owner) and `rangerstatellc@gmail.com` (super_admin + demo-org owner).

### Super-admin console — `/_authenticated/admin/*` (new in Phase III)

Gated by a pathless `/_authenticated/_superadmin/` layout whose `beforeLoad` calls an `assertSuperAdmin` server fn (uses `is_super_admin()` RPC). Nav entry only shown when `listMyOrgs` returns `isSuperAdmin: true` on the active profile.

- `/admin/orgs` — table of all organizations (name, slug, member count, ERP connections count, created_at). Actions: rename, archive, delete (cascade-protected), "Impersonate org" (sets active org id without requiring membership).
- `/admin/orgs/new` — create organization (name, slug); optionally seed an initial owner by email (creates auth user via admin API + invites).
- `/admin/orgs/$orgId` — drill-in: members list with roles (promote/demote/remove across any role including owner), pending invitations, ERP connections summary, recent sync_events.
- `/admin/users` — cross-org user search (by email/name), shows their memberships + roles + platform roles. Grant/revoke `super_admin`.
- `/admin/audit` — read-only feed merging `sync_events` + `erp_credential_audit` + (new) `platform_audit` entries for super-admin actions.

### Super-admin server functions (new)

All use `requireSupabaseAuth` + `is_super_admin()` check before any privileged action; non-super-admins get 403. Privileged ops load `supabaseAdmin` inside the handler.

- `adminListOrganizations()`, `adminCreateOrganization({ name, slug, initialOwnerEmail? })`, `adminUpdateOrganization`, `adminArchiveOrganization`, `adminDeleteOrganization`
- `adminListOrgMembers(orgId)`, `adminAddMember({ orgId, email, roles[] })`, `adminSetMemberRoles({ orgId, userId, roles[] })`, `adminRemoveMember({ orgId, userId })`
- `adminListUsers({ search })`, `adminGrantSuperAdmin({ userId })`, `adminRevokeSuperAdmin({ userId })`
- `adminListAudit({ filters })`
- All write actions insert a `platform_audit` row (`actor_user_id`, `action`, `target_type`, `target_id`, `payload jsonb`, `occurred_at`).

### New schema (Phase III migration)

- `platform_audit` (id, actor_user_id, action text, target_type text, target_id uuid nullable, payload jsonb, occurred_at) — append-only, super-admin readable, service-role writable. RLS: `SELECT` to `is_super_admin()`, no client `INSERT` (server fns use admin client).

### `/_authenticated/dashboard`

- Summary tiles: In-sync, Out-of-sync, No manual, Pending review (counts from `manual_sync_status`).
- Filters: search (SKU/name), status, ERP connection.
- Sortable table: SKU, Name, Status badge, Last BOM change, Last manual publish, Out-of-sync since (relative time), Actions ("Open manual" / "Create manual", "View BOM").
- Out-of-sync rows pinned/highlighted at top by default.
- Side panel "View BOM": shows `normalized_items` of latest snapshot with revision + captured_at.
- Super-admin extra: org filter at the top (defaults to active org; "All orgs" option only when `is_super_admin`).

### `/_authenticated/products/$productId/manuals/$manualId?`

**Create flow (no manual yet):**

- Empty-state card → "Create manual" → modal for title → creates `manuals` row + first `manual_versions` (state=draft, version_number=1, bom_snapshot_id = latest snapshot).

**Editor layout (3-column):**

- **Left rail:** product summary (SKU, name), BOM snippet (collapsible list of normalized items), version selector + state badge, "Tied to BOM rev X (captured Y)".
- **Main editor:** structured sections, each a typed sub-document inside `manual_versions.content`:
  - `tools[]` — name, optional spec
  - `parts[]` — auto-seeded from BOM `normalized_items`, editable descriptions, marked when a part disappears in newer BOM
  - `steps[]` — ordered, title + rich-text body, optional asset refs
  - `warnings[]` — severity (info/caution/danger) + body
  - `torque_specs[]` — fastener, value, unit, pattern/sequence
  - `images[]` — references to `manual_assets` rows + annotation metadata (callouts, arrows, boxes — stored as JSON; renderer overlays SVG)
- **Right rail:** version controls (Save draft, Submit for review, Approve, Publish — gated by role), change_summary text box, drift warning when newer `bom_snapshot` exists than the one this version is tied to ("BOM has changed since this draft started. View diff / Rebase onto latest.").

**Asset upload:** direct-to-Supabase-Storage uploads from the client using a short-lived signed URL minted by a server fn. Annotation editor is a simple canvas overlay storing shapes in `metadata`.

**State transitions (server fns, with role checks + audit via `sync_events`):**

- `saveDraft(versionId, content, changeSummary)`
- `submitForReview(versionId)` → state=in_review
- `approveVersion(versionId)` → state=approved, stamp `approved_by`
- `publishVersion(versionId)` → state=published, stamp `published_at`; trigger sets prior published to `superseded` and updates `manual_sync_status` to `in_sync`
- `createNewDraftFromLatest(manualId)` — used when starting work after a BOM change; carries content forward, points at new bom_snapshot

**Public web manual route (set up scaffold here, polish later):**

- `/manuals/$slug` — public SSR route, renders the latest `published` `manual_versions.content` for the product's `web_slug`. Read via a public `createServerFn` using the server publishable Supabase client + a narrow `TO anon` SELECT policy that only exposes published versions. Sets per-page `head()` meta (title, description, og:title, og:description, og:image when a hero image exists).

**Phase III exit:** end-to-end loop works — Odoo sync → out_of_sync product → create/edit manual → publish → status back to in_sync → public `/manuals/<slug>` shows the new version. Super admin can create/rename orgs, manage members across any org, grant/revoke `super_admin`, and view a unified audit feed.

---

## Phase IV (future, not in scope now)

- HTML→PDF rendering via Browserless/PDFShift, `pdf_url` populated on publish.
- Scheduled syncs (pg_cron hitting a `/api/public/cron/sync-boms/$connectionId` route with a shared secret).
- BOM diff viewer + "rebase draft onto latest BOM" UX.
- "Time from BOM change to updated manual" analytics view on the dashboard.
- Additional ERP providers (NetSuite, D365) reusing the `erp_connections` + per-connection secret pattern.
- AI/video-to-doc helpers operating on the structured `content` JSON.

---

## Open items to confirm before I start Phase I

1. **Domain for public manual URLs** — fine to use the default Lovable domain for now and add a custom domain later?
2. **First admin user** — should I seed a hard-coded `admin@manumanuals.demo` in the demo org migration, or do you want to sign up via a one-time bootstrap token on first run?
3. **Invitation email delivery** — Supabase's built-in auth email is the path of least resistance for v1. OK to defer Resend/Postmark to later?

If those three are "yes / yes / yes", I'll start Phase I on approval.  
Yes, [desotod@gmail.com](mailto:desotod@gmail.com) for hardcoded main 1st admin, yes.