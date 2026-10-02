
CREATE TABLE public.part_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sku citext NOT NULL,
  alias text NULL,
  image_path text NULL,
  image_url text NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_catalog_org_sku_unique UNIQUE (organization_id, sku)
);

CREATE INDEX part_catalog_org_idx ON public.part_catalog (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_catalog TO authenticated;
GRANT ALL ON public.part_catalog TO service_role;

ALTER TABLE public.part_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read part catalog"
  ON public.part_catalog FOR SELECT
  TO authenticated
  USING (public.has_org_access(organization_id));

CREATE POLICY "Admins can insert part catalog"
  ON public.part_catalog FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can update part catalog"
  ON public.part_catalog FOR UPDATE
  TO authenticated
  USING (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can delete part catalog"
  ON public.part_catalog FOR DELETE
  TO authenticated
  USING (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  );

CREATE TRIGGER part_catalog_set_updated_at
  BEFORE UPDATE ON public.part_catalog
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
