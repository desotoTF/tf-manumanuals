
-- 1) Lock down the Lovable migrations ledger table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='_lovable_applied_migrations') THEN
    EXECUTE 'ALTER TABLE public._lovable_applied_migrations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public._lovable_applied_migrations FROM anon, authenticated';
  END IF;
END$$;

-- 2) Revoke EXECUTE on SECURITY DEFINER functions from PostgREST-exposed roles.
--    They remain callable from RLS policies, triggers, and service_role server code.
REVOKE EXECUTE ON FUNCTION public.has_org_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, public.org_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_org_any_role(uuid, public.org_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_platform_role(uuid, public.platform_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.next_manual_version_number(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_manual_sync_status(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_bom_recompute_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_product_seed_sync_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_version_recompute_after() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_version_state_change() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.erp_store_credentials(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erp_read_credentials(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erp_delete_credentials(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erp_hard_delete_connection(uuid) FROM PUBLIC, anon, authenticated;
