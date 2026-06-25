
-- 1) Schema tweaks ---------------------------------------------------------
ALTER TABLE public.erp_connections
  ADD COLUMN IF NOT EXISTS vault_secret_id uuid,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ALTER COLUMN secret_name DROP NOT NULL;

-- 2) Vault-backed credential helpers ---------------------------------------

-- Store (insert or rotate) credentials for an ERP connection.
-- Stores a JSON blob { api_key, database, username } so future providers can extend.
CREATE OR REPLACE FUNCTION public.erp_store_credentials(
  _connection_id uuid,
  _api_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_org_id      uuid;
  v_secret_id   uuid;
  v_existing_id uuid;
  v_payload     text;
  v_action      text;
BEGIN
  SELECT organization_id, vault_secret_id
    INTO v_org_id, v_existing_id
  FROM public.erp_connections
  WHERE id = _connection_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'ERP connection % not found', _connection_id;
  END IF;

  IF NOT public.has_org_any_role(v_org_id, ARRAY['owner'::org_role, 'admin'::org_role]) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  v_payload := jsonb_build_object('api_key', _api_key)::text;

  IF v_existing_id IS NULL THEN
    v_secret_id := vault.create_secret(
      v_payload,
      'erp_cred_' || _connection_id::text,
      'ERP credential for connection ' || _connection_id::text
    );
    UPDATE public.erp_connections
       SET vault_secret_id = v_secret_id,
           credentials_version = 1
     WHERE id = _connection_id;
    v_action := 'created';
  ELSE
    PERFORM vault.update_secret(v_existing_id, v_payload, NULL, NULL);
    UPDATE public.erp_connections
       SET credentials_version = credentials_version + 1
     WHERE id = _connection_id;
    v_secret_id := v_existing_id;
    v_action := 'rotated';
  END IF;

  INSERT INTO public.erp_credential_audit (erp_connection_id, action, actor_user_id, note)
  VALUES (_connection_id, v_action::erp_credential_action, auth.uid(), NULL);

  RETURN v_secret_id;
END;
$$;

-- Read the decrypted credential payload (server-side use only).
CREATE OR REPLACE FUNCTION public.erp_read_credentials(_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_org_id    uuid;
  v_secret_id uuid;
  v_decrypted text;
BEGIN
  SELECT organization_id, vault_secret_id
    INTO v_org_id, v_secret_id
  FROM public.erp_connections
  WHERE id = _connection_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'ERP connection % not found', _connection_id;
  END IF;

  IF NOT public.has_org_any_role(v_org_id, ARRAY['owner'::org_role, 'admin'::org_role]) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'No credentials stored for connection %', _connection_id;
  END IF;

  SELECT decrypted_secret
    INTO v_decrypted
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  IF v_decrypted IS NULL THEN
    RAISE EXCEPTION 'Vault secret missing for connection %', _connection_id;
  END IF;

  RETURN v_decrypted::jsonb;
END;
$$;

-- Delete credentials and deactivate the connection.
CREATE OR REPLACE FUNCTION public.erp_delete_credentials(_connection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_org_id    uuid;
  v_secret_id uuid;
BEGIN
  SELECT organization_id, vault_secret_id
    INTO v_org_id, v_secret_id
  FROM public.erp_connections
  WHERE id = _connection_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'ERP connection % not found', _connection_id;
  END IF;

  IF NOT public.has_org_any_role(v_org_id, ARRAY['owner'::org_role, 'admin'::org_role]) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  UPDATE public.erp_connections
     SET vault_secret_id = NULL,
         is_active = false
   WHERE id = _connection_id;

  INSERT INTO public.erp_credential_audit (erp_connection_id, action, actor_user_id, note)
  VALUES (_connection_id, 'revoked'::erp_credential_action, auth.uid(), NULL);
END;
$$;

-- Restrict execution: only authenticated app users can call these (the
-- functions themselves re-check org-admin role); service_role keeps full access.
REVOKE ALL ON FUNCTION public.erp_store_credentials(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_read_credentials(uuid)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_delete_credentials(uuid)      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_store_credentials(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_read_credentials(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_delete_credentials(uuid)      TO authenticated, service_role;
