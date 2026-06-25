# Three things

## 1. Add an Account page so you can change your temp password

There is no profile/account route today — that's the gap. I'll add:

- **New route** `src/routes/_authenticated/account.tsx` at `/account` with:
  - Read-only **Email** and **Full name** (full name editable, saved to `profiles`).
  - **Change password** form: new password + confirm. Calls `supabase.auth.updateUser({ password })` directly from the client (the user is already authenticated, no server fn needed).
  - Success/error toasts; on success, the temp password is replaced immediately.
- **Sidebar link**: add "Account" to `src/components/AppSidebar.tsx` under the user section (or as its own item) so it's reachable.

After this ships you'd sign in once with the temp password from `/api/public/bootstrap`, go to **Account**, set a real password, done.

## 2. ERP settings — yes, per-org; yes, that's where the Odoo key goes

Confirmed from `src/routes/_authenticated/settings.erp.tsx`:

- The page reads `orgId` from `useActiveOrg()` and scopes every query/mutation to it. Each organization has its own ERP connections; switching orgs in the org switcher shows a different set.
- **Connect Odoo** dialog (admin-only) is exactly where the Odoo **API key** goes, along with Base URL, Database, and Username. Create the key in Odoo via **Preferences → Account Security → New API Key**, paste it here, click **Test connection**, then **Save**. The key is validated against Odoo, then stored encrypted in the DB vault (not as a Lovable secret).
- You can rotate or revoke the key later from the same page.

No code change needed for this one — just confirming.

## 3. Render web service — exact field values

Render's form fields, filled from `render.yaml`:

- **Root Directory**: *leave blank* (repo root — `render.yaml`, `package.json`, and `vite.config.ts` are all there).
- **Runtime**: Node
- **Build Command**:
  ```
  curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install && NITRO_PRESET=node-server bun run build
  ```
  (`bun install` alone is not enough — it skips the actual Vite/Nitro build, so there's nothing to start.)
- **Start Command**:
  ```
  node .output/server/index.mjs
  ```
- **Health Check Path**: `/`
- **Node Version** (env var): `20`
- Plus the Supabase env vars from `RENDER_DEPLOY.md` §4.

If you committed `render.yaml` at the repo root and used **New + → Blueprint** instead of **Web Service**, Render reads all of this automatically and you don't fill any of those fields in by hand. I'll also tighten the wording in `RENDER_DEPLOY.md` to call out the Blueprint path and make the build/start commands copy-pasteable as single lines.

---

## Files

- **New**: `src/routes/_authenticated/account.tsx`
- **Edit**: `src/components/AppSidebar.tsx` (add Account link)
- **Edit**: `RENDER_DEPLOY.md` (copy-pasteable single-line build cmd, Blueprint note, explicit "Root Directory: blank")

No DB migration, no new server functions, no new secrets.
