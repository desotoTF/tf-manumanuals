
-- RLS policies evaluate as the calling role (authenticated), so that role needs
-- EXECUTE on the helper functions even though they're SECURITY DEFINER.
GRANT EXECUTE ON FUNCTION public.has_org_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, public.org_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_any_role(uuid, public.org_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_platform_role(uuid, public.platform_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
