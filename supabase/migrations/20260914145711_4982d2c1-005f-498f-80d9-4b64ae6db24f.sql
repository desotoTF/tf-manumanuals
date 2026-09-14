CREATE TYPE public.integration_provider AS ENUM ('docsie');
CREATE TYPE public.import_job_status AS ENUM ('queued','submitted','processing','ready','applied','failed','canceled');

CREATE TABLE public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider public.integration_provider NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  workspace_id text,
  vault_secret_id uuid,
  credentials_version integer NOT NULL DEFAULT 0,
  last_test_at timestamptz,
  last_test_status text,
  last_test_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections TO authenticated;
GRANT ALL ON public.integration_connections TO service_role;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read integrations"
  ON public.integration_connections FOR SELECT TO authenticated
  USING (public.has_org_access(organization_id) OR public.is_super_admin());
CREATE POLICY "admins insert integrations"
  ON public.integration_connections FOR INSERT TO authenticated
  WITH CHECK (public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role]) OR public.is_super_admin());
CREATE POLICY "admins update integrations"
  ON public.integration_connections FOR UPDATE TO authenticated
  USING (public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role]) OR public.is_super_admin())
  WITH CHECK (public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role]) OR public.is_super_admin());
CREATE POLICY "admins delete integrations"
  ON public.integration_connections FOR DELETE TO authenticated
  USING (public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role]) OR public.is_super_admin());

CREATE TRIGGER trg_integration_connections_updated
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.manual_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  manual_id uuid REFERENCES public.manuals(id) ON DELETE SET NULL,
  version_id uuid REFERENCES public.manual_versions(id) ON DELETE SET NULL,
  provider public.integration_provider NOT NULL DEFAULT 'docsie',
  source_url text NOT NULL,
  external_job_id text,
  status public.import_job_status NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  status_detail text,
  error text,
  result_title text,
  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_manual_import_jobs_org ON public.manual_import_jobs (organization_id, created_at DESC);
CREATE INDEX idx_manual_import_jobs_manual ON public.manual_import_jobs (manual_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_import_jobs TO authenticated;
GRANT ALL ON public.manual_import_jobs TO service_role;
ALTER TABLE public.manual_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read import jobs"
  ON public.manual_import_jobs FOR SELECT TO authenticated
  USING (public.has_org_access(organization_id) OR public.is_super_admin());
CREATE POLICY "members insert import jobs"
  ON public.manual_import_jobs FOR INSERT TO authenticated
  WITH CHECK (public.has_org_access(organization_id));
CREATE POLICY "members update import jobs"
  ON public.manual_import_jobs FOR UPDATE TO authenticated
  USING (public.has_org_access(organization_id))
  WITH CHECK (public.has_org_access(organization_id));
CREATE POLICY "admins delete import jobs"
  ON public.manual_import_jobs FOR DELETE TO authenticated
  USING (public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role]) OR public.is_super_admin());

CREATE TRIGGER trg_manual_import_jobs_updated
  BEFORE UPDATE ON public.manual_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.integration_store_credentials(_connection_id uuid, _api_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','vault'
AS $function$
DECLARE
  v_org_id uuid;
  v_existing_id uuid;
  v_secret_id uuid;
  v_payload text;
BEGIN
  SELECT organization_id, vault_secret_id INTO v_org_id, v_existing_id
  FROM public.integration_connections WHERE id = _connection_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Integration connection % not found', _connection_id;
  END IF;

  IF NOT (
    public.has_org_any_role(v_org_id, ARRAY['owner'::org_role,'admin'::org_role])
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  v_payload := jsonb_build_object('api_key', _api_key)::text;

  IF v_existing_id IS NULL THEN
    v_secret_id := vault.create_secret(
      v_payload,
      'integration_cred_' || _connection_id::text,
      'Integration credential for connection ' || _connection_id::text
    );
    UPDATE public.integration_connections
       SET vault_secret_id = v_secret_id, credentials_version = 1
     WHERE id = _connection_id;
  ELSE
    PERFORM vault.update_secret(v_existing_id, v_payload, NULL, NULL);
    UPDATE public.integration_connections
       SET credentials_version = credentials_version + 1
     WHERE id = _connection_id;
    v_secret_id := v_existing_id;
  END IF;

  RETURN v_secret_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.integration_read_credentials(_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','vault'
AS $function$
DECLARE
  v_org_id uuid;
  v_secret_id uuid;
  v_decrypted text;
BEGIN
  SELECT organization_id, vault_secret_id INTO v_org_id, v_secret_id
  FROM public.integration_connections WHERE id = _connection_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Integration connection % not found', _connection_id;
  END IF;

  IF NOT (public.has_org_access(v_org_id) OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'No credentials stored for connection %', _connection_id;
  END IF;

  SELECT decrypted_secret INTO v_decrypted FROM vault.decrypted_secrets WHERE id = v_secret_id;
  IF v_decrypted IS NULL THEN
    RAISE EXCEPTION 'Vault secret missing for connection %', _connection_id;
  END IF;

  RETURN v_decrypted::jsonb;
END;
$function$;

CREATE OR REPLACE FUNCTION public.integration_delete_connection(_connection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','vault'
AS $function$
DECLARE
  v_org_id uuid;
  v_secret_id uuid;
BEGIN
  SELECT organization_id, vault_secret_id INTO v_org_id, v_secret_id
  FROM public.integration_connections WHERE id = _connection_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Integration connection % not found', _connection_id;
  END IF;

  IF NOT (
    public.has_org_any_role(v_org_id, ARRAY['owner'::org_role,'admin'::org_role])
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  DELETE FROM public.integration_connections WHERE id = _connection_id;
END;
$function$;