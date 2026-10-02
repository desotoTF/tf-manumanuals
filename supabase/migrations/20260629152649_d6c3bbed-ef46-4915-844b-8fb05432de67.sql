
UPDATE public.organizations
SET name = 'ThumperFab Manuals'
WHERE id = '00000000-0000-0000-0000-000000000001';

CREATE OR REPLACE FUNCTION public.erp_hard_delete_connection(_connection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM public.erp_connections WHERE id = _connection_id;
  IF _org IS NULL THEN
    RAISE EXCEPTION 'connection not found';
  END IF;
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid() AND pr.role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.org_roles r
      WHERE r.user_id = auth.uid()
        AND r.organization_id = _org
        AND r.role IN ('owner','admin')
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM public.erp_delete_credentials(_connection_id);
  DELETE FROM public.erp_connections WHERE id = _connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_hard_delete_connection(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.erp_hard_delete_connection(uuid) TO authenticated;
