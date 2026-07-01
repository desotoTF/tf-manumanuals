GRANT EXECUTE ON FUNCTION public.erp_read_credentials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_store_credentials(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_delete_credentials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_hard_delete_connection(uuid) TO authenticated;