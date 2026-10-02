REVOKE EXECUTE ON FUNCTION public.org_effective_plan(uuid), public.org_has_feature(uuid, text), public.org_active_manual_count(uuid), public.org_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_has_feature(uuid, text), public.org_usage(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.org_effective_plan(uuid), public.org_active_manual_count(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_enforce_manual_limit(), public.tg_enforce_seat_limit(), public.tg_org_default_subscription(), public.handle_new_user() FROM PUBLIC, anon, authenticated;