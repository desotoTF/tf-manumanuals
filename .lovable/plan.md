## Root cause

The "Sync migrations to external Supabase" workflow keeps an internal ledger (`_lovable_migrations` or similar) on the external DB tracking which migration filenames have been applied. When the workflow was first installed, it pre-seeded that ledger with every migration file that already existed in `supabase/migrations/` at that moment — assuming the external DB was already in sync with the Lovable DB.

It wasn't. The external DB is an older snapshot from before tables like `manual_templates`, `manual_sync_status`, `manual_assets`, `manual_versions`, `bom_snapshots`, etc. existed. The ledger marked all of those `CREATE TABLE` migrations as applied, but the SQL never ran, so the tables don't exist. Every new migration that touches one of those tables now fails with `relation "public.X" does not exist`.

Latest failure:
```
apply 20260629162533_d8a8bf15...sql
ERROR:  relation "public.manual_templates" does not exist
```

## Fix strategy

Two halves: bring the external DB schema up to date in one shot, then realign the ledger so future migrations apply cleanly.

### Step 1 — Diagnose the gap (you run this; I can't reach the external DB from here)

Connect to the external DB using the same connection string in `EXTERNAL_SUPABASE_DB_URL` and list which `public.*` tables already exist:

```bash
psql "$EXTERNAL_SUPABASE_DB_URL" -c "\dt public.*"
psql "$EXTERNAL_SUPABASE_DB_URL" -c "SELECT name FROM _lovable_migrations ORDER BY name;"
```

(If the ledger table is named something else, the workflow file will tell us — it's `.github/workflows/sync-external-db.yml`.)

Share both outputs. That tells me exactly which migrations were truthfully applied vs. only marked.

### Step 2 — Create a single "catch-up" migration

Based on the diff, I'll write one new migration file that re-runs the missing schema **idempotently** — `CREATE TABLE IF NOT EXISTS`, `CREATE TYPE … IF NOT EXISTS` (via `DO $$ … EXCEPTION` block since Postgres doesn't support `IF NOT EXISTS` on `CREATE TYPE` directly), `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE POLICY` wrapped in drop-if-exists, etc.

This catch-up runs safely on:
- the **external DB** → creates everything that's missing
- the **Lovable DB** → no-ops because everything already exists

### Step 3 — Reset the ledger entries that lied

In the same catch-up migration, `DELETE FROM _lovable_migrations WHERE name IN (...)` for the migrations whose tables we just (re)created, then re-insert them at the bottom so ordering stays clean. Or simpler: leave the ledger alone and rely on idempotency — the workflow will skip already-applied filenames either way, and the new failing migration (`20260629162533`) becomes valid because the table now exists.

### Step 4 — Re-run the failed workflow

From GitHub → Actions → the failed run → "Re-run failed jobs". Migration `20260629162533` re-runs, this time successfully because `manual_templates` exists. From then on, every new migration syncs automatically.

### Step 5 — Backfill data (optional, separate decision)

This only fixes the **schema**. The external DB will still have no rows in the newly created tables (no templates, no manuals, no BOM snapshots). If you want the existing manual you created in the Lovable preview to also show up on the Render site, that's a separate one-shot data export/import — flag it after schema is in sync and we'll handle it.

## What I need from you to proceed

1. The output of `\dt public.*` against the external DB
2. The output of `SELECT name FROM _lovable_migrations ORDER BY name;` against the external DB (or whatever the ledger table is — the workflow file names it)

Once I have those, I'll write the single catch-up migration and you re-run the workflow.