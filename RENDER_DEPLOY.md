# Deploying tf-manumanuals to Render.com

This app is a TanStack Start v1 / Vite project. Lovable's preview targets
Cloudflare Workers, but Render runs Node.js. The build is switched to a
Node server at deploy time via the `NITRO_PRESET=node-server` env var — no
changes to `vite.config.ts` are needed (that file stays Cloudflare-default
so the Lovable preview keeps working).

---

## 1. Prerequisites

- The GitHub mirror at `desotoTF/tf-manumanuals` (or your primary repo) is
  up to date — including `render.yaml` at the repo root.
- You have a Render account with billing enabled (the free tier sleeps and
  will be slow for SSR).
- You have access to the Supabase keys this app uses. See the **Supabase**
  section below — this is the one real blocker.

## 2. Supabase: pick one path

Lovable Cloud hides the `SUPABASE_SERVICE_ROLE_KEY`. The app uses it for:
- `src/routes/api/public/bootstrap.ts` (admin seeding)
- `src/lib/public-manuals.functions.ts` (public SSR of published manuals)
- `src/routes/api/public/mirror.ts` and similar admin paths

You have two options:

### Option A — Migrate to your own Supabase project (recommended)

1. Create a new project at supabase.com.
2. Run every file in `supabase/migrations/` against it, in order.
3. Recreate the `manual-assets` storage bucket (private).
4. Run the bootstrap route once against the new project to seed users.
5. Use the new project's URL, anon (publishable) key, and service-role key
   in the Render env vars below.

### Option B — Stay on Lovable Cloud's Supabase

Lovable will not give you the service-role key. You must:
- Leave `SUPABASE_SERVICE_ROLE_KEY` unset on Render.
- Remove or rework anything that imports `@/integrations/supabase/client.server`
  (the public manuals SSR loader and the bootstrap route will 500).

Option A is what we recommend.

## 3. Create the Render service

You have two ways to do this. **Use the Blueprint path** — it reads
`render.yaml` and fills everything in for you.

### Option 1 — Blueprint (recommended, zero manual fields)

1. Render dashboard → **New +** → **Blueprint**.
2. Connect the GitHub repo. Pick the `main` branch.
3. Render finds `render.yaml` at the repo root, shows a preview of the
   `manumanuals` web service, and pre-fills runtime, build command, start
   command, and health check. You don't fill in Root Directory / Build
   Command / Start Command by hand.
4. Click **Apply**. Then go to **Environment** and set the secret values
   listed in §4.

### Option 2 — Web Service (manual fields)

If you create a **Web Service** instead of a Blueprint, Render's form does
NOT auto-load `render.yaml`. Fill the fields in by hand exactly as below:

| Field                | Value                                          |
| -------------------- | ---------------------------------------------- |
| **Root Directory**   | *(leave blank — repo root)*                    |
| **Runtime**          | Node                                           |
| **Build Command**    | see one-line copy-paste below                  |
| **Start Command**    | `node .output/server/index.mjs`                |
| **Health Check Path**| `/`                                            |

**Build Command** (copy-paste as one line):

```
curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install && NITRO_PRESET=node-server bun run build
```

`bun install` alone is NOT a valid build — it only installs dependencies,
it doesn't produce `.output/server/index.mjs` for the start command to run.

Then add the env vars from §4 in the **Environment** tab.

## 4. Set environment variables

In the Render service's **Environment** tab, paste values for each:

| Key                              | Where to get it                                |
| -------------------------------- | ---------------------------------------------- |
| `NODE_VERSION`                   | `20`                                           |
| `NITRO_PRESET`                   | `node-server`                                  |
| `SUPABASE_URL`                   | Supabase project → Settings → API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY`       | Same page → `anon` / `publishable` key          |
| `SUPABASE_SERVICE_ROLE_KEY`      | Same page → `service_role` key (Option A only) |
| `VITE_SUPABASE_URL`              | Same as `SUPABASE_URL`                          |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | Same as `SUPABASE_PUBLISHABLE_KEY`              |
| `VITE_SUPABASE_PROJECT_ID`       | The subdomain part of the URL                  |
| `LOVABLE_API_KEY`                | Lovable AI gateway key (only if using AI features) |

The Blueprint path pre-creates the `NODE_VERSION` and `NITRO_PRESET` rows
(with default values) and stub rows for every secret — you only paste
values into the Render dashboard.

The `VITE_*` ones get baked into the client JS bundle at build time.
Changing them later requires a redeploy.

## 5. Deploy

Hit **Manual Deploy** → **Deploy latest commit**. First build takes 3–5 min
(Bun install + Vite build + Nitro output). Subsequent builds are faster.

When it goes green, open the `*.onrender.com` URL. You should land on the
sign-in page.

## 6. First-time sign-in (Option A only)

After deploying to a fresh Supabase project, seed the admin users by hitting:

```
https://YOUR-APP.onrender.com/api/public/bootstrap
```

Copy the `tempPassword` for each user from the JSON response, then sign in at
`/auth` and change the passwords from **Account** (in the sidebar).

## 7. Custom domain

Render service → **Settings** → **Custom Domains** → **Add**. Render shows
the CNAME / A records to add at your DNS provider. SSL is provisioned
automatically once DNS resolves.

## 8. Updates

Pushing to `main` on the connected GitHub repo triggers an auto-redeploy on
Render. The Lovable preview keeps deploying independently to its Cloudflare
URL — they don't conflict because the Node preset is only applied at the
Render build step via the env var.

---

## Troubleshooting

**Build succeeds but start fails with `Cannot find module '.../.output/server/index.mjs'`**
Your build command was `bun install` only. Replace it with the full one-line
build command in §3 Option 2 so the Vite/Nitro build actually runs.

**Build fails with `nitro: unknown preset`**
The `NITRO_PRESET` env var was not picked up. Verify it's set both in the
Render dashboard env tab and in `render.yaml`.

**500 on `/manuals/<slug>` with `service_role_key is required`**
You're on Option B (no service-role key). Either move to Option A or strip
the `supabaseAdmin` usage from `src/lib/public-manuals.functions.ts`.

**Sign-in works but every authenticated page bounces back to `/auth`**
The bearer attacher needs the publishable key to work in the browser.
Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` were set
**before** the build ran. If you added them after, trigger a new deploy.

**Static assets 404**
Ensure the build artifact at `.output/public` was produced. The Node server
serves it automatically. If missing, the build failed silently — check the
Render build logs.
