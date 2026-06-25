# Two Tasks

## 1. Get the one-time password for rangerstatellc@gmail.com

The bootstrap endpoint at `src/routes/api/public/bootstrap.ts` is idempotent. When called, if the user already exists it **rotates** their password and returns the new temp value in the JSON response. Nothing to change in code — you just need to call it once.

**How to run it** (pick either):

- **Browser**: open `https://id-preview--9ef353a3-ccb6-4767-99d7-c0cf84e7bb5c.lovable.app/api/public/bootstrap` (GET works).
- **Terminal**:
  ```bash
  curl -X POST https://id-preview--9ef353a3-ccb6-4767-99d7-c0cf84e7bb5c.lovable.app/api/public/bootstrap
  ```

The response JSON has a `results` array. Find the entry where `email` is `rangerstatellc@gmail.com` and copy `tempPassword`. Sign in at `/auth`, then change the password from the profile area. The password will not be shown again — save it immediately.

Note: this will also rotate `desotod@gmail.com`'s password (also returned in the same response), since the endpoint touches every seed user. If you want to avoid that, I can change the endpoint to take an `?email=` filter in build mode instead.

## 2. Hosting on Render.com

The app is a TanStack Start v1 project built with Vite, currently configured for the Cloudflare Workers edge target. Render.com does not run Workers — it runs Node.js services. So hosting on Render requires switching the server target to Node, then deploying as a Render **Web Service**.

### Steps

**a. Switch the server target to Node**
- Update `vite.config.ts` to use the Node target for `@tanstack/react-start` instead of the Cloudflare/Workers target. Output goes to `.output/server/index.mjs` (Node-compatible bundle).
- Verify `src/server.ts` doesn't rely on Workers-only globals.
- Keep all `createServerFn` code as-is — it's runtime-agnostic.

**b. Add a Render service manifest** (`render.yaml` at repo root):
```yaml
services:
  - type: web
    name: manumanuals
    runtime: node
    plan: starter
    buildCommand: bun install && bun run build
    startCommand: node .output/server/index.mjs
    envVars:
      - key: NODE_VERSION
        value: "20"
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_PUBLISHABLE_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: VITE_SUPABASE_URL
        sync: false
      - key: VITE_SUPABASE_PUBLISHABLE_KEY
        sync: false
      - key: VITE_SUPABASE_PROJECT_ID
        sync: false
      - key: LOVABLE_API_KEY
        sync: false
```

**c. Render dashboard steps** (you do these):
1. Render → **New** → **Web Service** → connect the GitHub repo (`desotoTF/tf-manumanuals` mirror or primary).
2. Render auto-detects `render.yaml`. Confirm.
3. In **Environment**, paste values for each secret. Copy them from the Lovable Cloud backend (Supabase) project. `SUPABASE_SERVICE_ROLE_KEY` is **not** retrievable via Lovable — you'll need it from the Supabase dashboard of the project, which Lovable Cloud doesn't expose. **This is the one blocker**: if you stay on Lovable Cloud's managed Supabase, the service role key isn't available to you, so server-side admin features (bootstrap route, `supabaseAdmin` usage) won't work on Render.
4. Deploy. First build takes ~3–5 min.
5. Add your custom domain under **Settings → Custom Domains** and update DNS as Render instructs.

### The Supabase / service-role caveat (important)

Lovable Cloud hides the service-role key. To host this on Render with full feature parity (bootstrap, public manual SSR via `supabaseAdmin`, etc.) you have two options:

- **Option A — Migrate to your own Supabase project.** Create a new Supabase project on supabase.com, run all the existing migrations from `supabase/migrations/` against it, copy storage buckets, then point Render's env vars at the new project. You own all keys.
- **Option B — Keep Lovable Cloud's Supabase, drop admin features.** Remove or rework anything that uses `supabaseAdmin` (the bootstrap route, public manual SSR). Render gets only the publishable/anon key.

### What I'd build (in build mode)

1. `vite.config.ts` change to Node target.
2. `render.yaml` at repo root.
3. A short `RENDER_DEPLOY.md` with the steps above + the Supabase migration path.

Tell me which Supabase option (A or B) you want before I start, and confirm you want both tasks implemented.
