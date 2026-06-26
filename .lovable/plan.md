# Keeping the two Supabase projects in sync

Every schema change I make goes through one file: a new SQL file in `supabase/migrations/`. Nothing else mutates the DB. That means "sync the second project" reduces to "run the same migration files against the second project, in order." Three viable options, from least to most automation.

---

## Option A — Manual paste (zero setup, what you do today)

After I run a migration, you:

1. Open the newest file in `supabase/migrations/` (it's already in the repo via the GitHub mirror).
2. Paste it into the **SQL Editor** of your external Supabase project and run it.
3. Done.

Pros: no tooling, no secrets, no risk of accidental writes.
Cons: you have to remember; easy to skip one and drift.

Best if migrations are rare (a few per week).

---

## Option B — GitHub Action that auto-applies migrations to project #2 (recommended)

Extend the existing `.github/workflows/mirror.yml` (or add a sibling workflow) so that after the mirror push, a job connects to your **external** Supabase and runs any new migration files via `psql`.

What you'd do once:

1. In your external Supabase project: **Settings → Database → Connection string** → copy the `postgresql://...` URI (the pooled "Session" one is fine for DDL).
2. In the **primary** GitHub repo: **Settings → Secrets → Actions** → add `EXTERNAL_SUPABASE_DB_URL` with that URI.
3. I add a workflow step that runs on every push to `main`:
  - Checks out the repo.
  - Tracks which migrations were already applied (via a small `_lovable_applied_migrations` table it creates in the external DB on first run).
  - For each `supabase/migrations/*.sql` not yet applied, runs it inside a transaction against `EXTERNAL_SUPABASE_DB_URL` and records the filename.

Pros: fully automatic, ordered, idempotent, auditable in Actions logs.
Cons: a bad migration fails the workflow — you'd fix and re-push. Service-grade DB URL lives in GitHub secrets (standard practice).

This is the best fit for "as seamless as possible."  
  
Let's do Option B. Provide me the '`postgresql://' URI and/or anything else I need to do on my end as a one-off.`

---

## Option C — Supabase CLI on your laptop

Install the Supabase CLI locally, then after each pull:

```
supabase link --project-ref <external-project-ref>
supabase db push
```

The CLI tracks applied migrations in a `supabase_migrations.schema_migrations` table on the target. Same effect as Option B but driven from your machine instead of CI.

Pros: no CI secret; you control timing.
Cons: requires you to remember to run it; needs the external DB password locally.

---

## What is NOT included

- **Data sync.** All three options replicate *schema, RLS, functions, triggers* — anything I put in a migration. They do **not** copy rows from your Lovable Cloud DB into the external one. Row data (products, manuals, BOM snapshots, uploaded PDFs in the `manual-assets` bucket) is separate. If you also need data parity, that's a different conversation (one-off `pg_dump`-style export, or a periodic sync job) — let me know and I'll plan it separately.
- **Storage bucket policies.** The SQL `CREATE POLICY ... ON storage.objects` statements I write *are* in migrations, so those copy over. The bucket itself (`manual-assets`) you'd create once in the external project (same name, private).
- **Edge function secrets / connections.** Things like `LOVABLE_API_KEY` and the ERP vault secrets live outside migrations. You'd set them once in the external project's dashboard.

---

## Recommendation

Go with **Option B**. It matches the spirit of the existing `mirror.yml` (one push → both repos stay in sync) and extends it to one push → both *databases* stay in sync. Manual paste is fine as a fallback while you set the secret up.

## My next step if you approve

Pick A, B, or C. If **B**, I'll:

1. Add `.github/workflows/sync-external-db.yml` that runs after pushes to `main`.
2. Have it bootstrap a `_lovable_applied_migrations(filename text primary key, applied_at timestamptz default now())` ledger in the external DB on first run.
3. Apply any unapplied `.sql` files in lexical order, each in its own transaction, failing loudly on error.
4. Tell you exactly which GitHub secret to set and where to get its value.

No changes to the Lovable Cloud DB itself, and the Lovable preview keeps working unchanged.