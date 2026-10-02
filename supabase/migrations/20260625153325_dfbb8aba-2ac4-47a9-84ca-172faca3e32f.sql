
-- 1. Platform role enum + table
DO $$ BEGIN
  CREATE TYPE public.platform_role AS ENUM ('super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.platform_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.platform_role NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.platform_roles TO authenticated;
GRANT ALL ON public.platform_roles TO service_role;

ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

-- Helper (security definer) — used by RLS, must exist before policies reference it
CREATE OR REPLACE FUNCTION public.has_platform_role(_user_id uuid, _role public.platform_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Convenience wrapper
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_platform_role(auth.uid(), 'super_admin'::public.platform_role);
$$;

-- Users can read their own platform roles; super admins can read all
DROP POLICY IF EXISTS "Read own platform roles" ON public.platform_roles;
CREATE POLICY "Read own platform roles" ON public.platform_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "Super admins manage platform roles" ON public.platform_roles;
CREATE POLICY "Super admins manage platform roles" ON public.platform_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 2. Extend existing tables' RLS to grant super_admin cross-tenant access.
-- Strategy: add a permissive ALL policy that opens access whenever is_super_admin().
-- Existing org-scoped policies remain in place for normal users.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'organizations','memberships','org_roles','invitations',
    'products','bom_snapshots','manuals','manual_versions','manual_assets',
    'manual_sync_status','erp_connections','erp_credential_audit','sync_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Super admin full access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Super admin full access" ON public.%I
         FOR ALL TO authenticated
         USING (public.is_super_admin())
         WITH CHECK (public.is_super_admin())', t);
  END LOOP;
END $$;

-- 3. Allow any authenticated super admin to INSERT organizations
--    (existing policies only cover member-scoped reads/writes).
--    The permissive ALL policy above already covers this, but we
--    also need an INSERT WITH CHECK because some orgs.* policies are FOR SELECT only.
--    The ALL policy handles it; nothing extra needed.

-- 4. Update ERP vault RPCs to accept super_admin as authorized caller.
CREATE OR REPLACE FUNCTION public.erp_store_credentials(_connection_id uuid, _api_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $function$
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

  IF NOT (
    public.has_org_any_role(v_org_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  ) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.erp_read_credentials(_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $function$
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

  IF NOT (
    public.has_org_any_role(v_org_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'No credentials stored for connection %', _connection_id;
  END IF;

  SELECT decrypted_secret INTO v_decrypted
  FROM vault.decrypted_secrets WHERE id = v_secret_id;

  IF v_decrypted IS NULL THEN
    RAISE EXCEPTION 'Vault secret missing for connection %', _connection_id;
  END IF;

  RETURN v_decrypted::jsonb;
END;
$function$;

CREATE OR REPLACE FUNCTION public.erp_delete_credentials(_connection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $function$
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

  IF NOT (
    public.has_org_any_role(v_org_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  ) THEN
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
$function$;
