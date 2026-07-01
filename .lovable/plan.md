## What I can fix (single migration)

I'll add one migration that resolves the ERROR and the actionable WARNs:

1. **ERROR — `public._lovable_applied_migrations` RLS disabled**
   - `ALTER TABLE public._lovable_applied_migrations ENABLE ROW LEVEL SECURITY;`
   - No policies added → table becomes invisible to `anon`/`authenticated` via PostgREST. The GitHub Actions sync workflow connects as the `postgres` superuser through the session pooler, which bypasses RLS, so the ledger keeps working.
   - Also `REVOKE ALL ... FROM anon, authenticated;` as belt-and-suspenders so it's not exposed on the Data API at all.

2. **WARN — SECURITY DEFINER functions callable via `/rest/v1/rpc/*`**
   Revoke EXECUTE from `anon` and `authenticated` on functions that should only run inside RLS policies / triggers / server code (they still work because RLS-policy calls and trigger execution don't require caller EXECUTE, and our server functions use the service role):
   - `has_org_access`, `has_org_role`, `has_org_any_role`, `has_platform_role`, `is_super_admin` (used inside RLS — callers don't need direct RPC access)
   - `next_manual_version_number`, `recompute_manual_sync_status` (server-side only)
   - `tg_bom_recompute_sync`, `tg_product_seed_sync_status`, `tg_version_recompute_after`, `tg_version_state_change`, `handle_new_user` (trigger functions — never meant to be RPC-called)
   - `erp_store_credentials`, `erp_read_credentials`, `erp_delete_credentials`, `erp_hard_delete_connection` (already do their own role checks internally, but there's no reason to expose them on the REST API; our code calls them via the service role in server functions — revoking anon/authenticated EXECUTE closes the RPC surface without breaking anything)

   Pattern per function:
   ```sql
   REVOKE EXECUTE ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon, authenticated;
   ```

## What I cannot fix from code (you'll need to do these)

3. **WARN — `citext` extension in `public` schema**
   Moving an installed extension requires `DROP EXTENSION ... CASCADE` + recreate in another schema, which would drop every `citext` column (e.g. the `tools.name` unique index) and needs superuser. Not safe to do in an automated migration on a live DB. **Recommended: leave as-is** — this is a very common warning and low risk for the `citext` extension specifically. If you want it moved, it's a manual maintenance window task.

4. **WARN — Leaked Password Protection disabled**
   Dashboard-only setting. In the external Supabase project:
   Authentication → Providers → Email → enable **Password HIBP Check** (Leaked password protection).

## Summary

| Finding | Action |
|---|---|
| RLS on `_lovable_applied_migrations` | Migration (me) |
| SECURITY DEFINER RPC exposure (all listed) | Migration (me) |
| `citext` in public schema | Leave as-is, or manual maintenance (you) |
| Leaked password protection | Dashboard toggle (you) |

Approve and I'll write the migration.
