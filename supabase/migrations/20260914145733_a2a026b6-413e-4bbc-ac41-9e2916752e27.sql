REVOKE ALL ON FUNCTION public.integration_store_credentials(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.integration_read_credentials(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.integration_delete_connection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integration_store_credentials(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.integration_read_credentials(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.integration_delete_connection(uuid) TO authenticated, service_role;