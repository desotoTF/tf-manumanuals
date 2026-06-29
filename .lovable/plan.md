## Root cause

The sync workflow applies migrations in **filename sort order**. Right now:

```
…20260629152649_…sql   skip (already applied)
…20260629162533_…sql   apply → ERROR: relation "public.manual_templates" does not exist
…20260629200227_…sql   never reached (script aborts on the error above)
```

The catch-up migration I wrote (`20260629200227_…`) is correct, but its timestamp sorts it **after** the broken migration, so it never runs. The set -euo pipefail in the workflow makes the first failure kill the loop.

## Fix

Rename the catch-up file so it sorts **before** `20260629162533_d8a8bf15…sql`. The cleanest choice is a timestamp just before it — e.g. `20260629162500_catchup_external_db_schema.sql`.

The file content stays exactly the same (it's already idempotent — safe to run on both Lovable DB and external DB). Only the filename changes.

### Why not just delete the bad migration?

`20260629162533_d8a8bf15…sql` already ran successfully on the Lovable DB. Deleting or renaming it would desync the two databases differently and break Lovable's own migration history. Better to slip the catch-up in front of it.

### Ledger consideration

The ledger on the external DB has not seen `20260629162500_catchup…sql` yet (new filename), so the workflow will pick it up on the next run. The renamed catch-up creates `manual_templates` and friends, then `20260629162533_…sql` re-runs cleanly because the table now exists.

## Steps (after you approve)

1. **Rename the file** from `supabase/migrations/20260629200227_cd6bd50a-59ab-4b71-aff2-f82f0c3f1e7d.sql` → `supabase/migrations/20260629162500_catchup_external_db_schema.sql`. Content unchanged.
2. Push to main (auto-syncs through Lovable's GitHub integration).
3. You re-run **Sync migrations to external Supabase** in the primary repo's Actions tab.

## Expected log on the next run

```
skip  20260629152649_…sql (already applied)
apply 20260629162500_catchup_external_db_schema.sql   ← creates manual_templates etc.
apply 20260629162533_d8a8bf15…sql                      ← now succeeds
```

## After it goes green

Reload the Render-deployed site:
- `/settings/templates` should let you create/edit the master template.
- Clicking a manual card should open the editor.

If either is still broken, that's separate from schema drift and I'll dig into the code/data next. Data backfill (copying your existing manuals/templates from Lovable DB → external DB) is still optional and a separate step once you ask.

## What I need from you

Just approve this plan and I'll do the rename in one edit.
