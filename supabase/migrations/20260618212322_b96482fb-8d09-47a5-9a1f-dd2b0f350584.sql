
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_access(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(UUID, public.org_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_any_role(UUID, public.org_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_manual_version_number(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recompute_manual_sync_status(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_product_seed_sync_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_bom_recompute_sync() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_version_state_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_version_recompute_after() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_org_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(UUID, public.org_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_any_role(UUID, public.org_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_manual_version_number(UUID) TO authenticated;
