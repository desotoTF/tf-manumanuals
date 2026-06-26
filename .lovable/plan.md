## Problem

The external Supabase DB was bootstrapped manually before the sync workflow existed, so its schema is already at parity with the repo. But the workflow's `_lovable_applied_migrations` ledger is empty, so on first run it tried to re-apply `20260618212238_...sql` and failed at `CREATE TYPE org_role` (already exists).

We don't want to rewrite historical migrations to be idempotent — too risky, and pointless since the external DB is already current.

## Fix: one-time ledger backfill

Tell the external DB "every migration currently in `supabase/migrations/` has already been applied." Then the next workflow run skips all of them, and only future migrations execute.

Two ways to do it — pick one:

### Option A — Run a backfill SQL in the external DB's SQL Editor (simplest)

Paste this into the external project's SQL Editor and run once:

```sql
INSERT INTO public._lovable_applied_migrations (filename) VALUES
  ('20260618212238_5226a0fb-024e-4cc6-9df3-7e5a872e26f1.sql'),
  ('<next-migration-filename>.sql'),
  ...
ON CONFLICT (filename) DO NOTHING;
```

I'll generate the exact `VALUES` list from `ls supabase/migrations/*.sql` so it's complete and in order — you just copy-paste.

### Option B — Add a one-shot `workflow_dispatch` input to the sync workflow

Add a `backfill_only` boolean input. When true, the apply step inserts every filename into the ledger instead of running the SQL. After the backfill run, you trigger the workflow again normally and it skips everything cleanly.

Pros: stays in GitHub, repeatable if you ever add another external DB.
Cons: more workflow code to maintain.

**Recommendation: Option A.** One paste, done. The workflow itself doesn't need changes.

## What happens next

1. You run the backfill SQL in the external DB.
2. Re-run the **Sync migrations to external Supabase** workflow from the Actions tab.
3. Log should show `skip <every existing migration>` and `No new migrations to apply.`
4. From here on, every new migration I create gets auto-applied to both DBs.

## Out of scope (still your responsibility on the external project)

- Storage bucket `manual-assets` (private)
- Edge function / runtime secrets
- Row data (products, manuals, BOMs)
