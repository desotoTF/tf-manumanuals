-- =====================================================================
-- Catch-up migration for external DB schema drift. Idempotent.
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE public.manual_template_layout AS ENUM ('classic','compact','field_guide','service_card');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.manual_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  layout public.manual_template_layout NOT NULL DEFAULT 'classic',
  default_content JSONB NOT NULL DEFAULT '{"tools":[],"parts":[],"steps":[],"warnings":[],"torque_specs":[],"images":[]}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_master BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.manual_templates
  ADD COLUMN IF NOT EXISTS branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_master BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS manual_templates_org_idx ON public.manual_templates(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS manual_templates_one_default_per_org
  ON public.manual_templates(organization_id) WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_templates TO authenticated;
GRANT ALL ON public.manual_templates TO service_role;

ALTER TABLE public.manual_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members can read templates" ON public.manual_templates;
CREATE POLICY "members can read templates"
  ON public.manual_templates FOR SELECT TO authenticated
  USING (public.has_org_access(organization_id));

DROP POLICY IF EXISTS "admins manage templates" ON public.manual_templates;
CREATE POLICY "admins manage templates"
  ON public.manual_templates FOR ALL TO authenticated
  USING (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role])
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role])
    OR public.is_super_admin()
  );

DROP TRIGGER IF EXISTS manual_templates_updated_at ON public.manual_templates;
CREATE TRIGGER manual_templates_updated_at
  BEFORE UPDATE ON public.manual_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.manuals
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.manual_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'authored';

ALTER TABLE public.manual_versions
  ADD COLUMN IF NOT EXISTS source_pdf_path TEXT;

DROP POLICY IF EXISTS "manual-assets read by org members" ON storage.objects;
CREATE POLICY "manual-assets read by org members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'manual-assets'
    AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "manual-assets write by authenticated" ON storage.objects;
CREATE POLICY "manual-assets write by authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'manual-assets'
    AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "manual-assets update by authenticated" ON storage.objects;
CREATE POLICY "manual-assets update by authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'manual-assets')
  WITH CHECK (bucket_id = 'manual-assets');

DROP POLICY IF EXISTS "manual-assets delete by authenticated" ON storage.objects;
CREATE POLICY "manual-assets delete by authenticated"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'manual-assets');

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS public.tools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            CITEXT NOT NULL,
  spec            TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tools_org_name_unique UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS tools_org_idx ON public.tools (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tools TO authenticated;
GRANT ALL ON public.tools TO service_role;

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read tools" ON public.tools;
CREATE POLICY "Org members read tools"
  ON public.tools FOR SELECT TO authenticated
  USING (public.has_org_access(organization_id));

DROP POLICY IF EXISTS "Org admins insert tools" ON public.tools;
CREATE POLICY "Org admins insert tools"
  ON public.tools FOR INSERT TO authenticated
  WITH CHECK (public.has_org_access(organization_id));

DROP POLICY IF EXISTS "Org admins update tools" ON public.tools;
CREATE POLICY "Org admins update tools"
  ON public.tools FOR UPDATE TO authenticated
  USING (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role,'editor'::org_role])
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role,'editor'::org_role])
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Org admins delete tools" ON public.tools;
CREATE POLICY "Org admins delete tools"
  ON public.tools FOR DELETE TO authenticated
  USING (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role])
    OR public.is_super_admin()
  );

DROP TRIGGER IF EXISTS tools_set_updated_at ON public.tools;
CREATE TRIGGER tools_set_updated_at
  BEFORE UPDATE ON public.tools
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$ BEGIN
  CREATE TYPE public.bom_exclusion_match_type AS ENUM ('exact','prefix','suffix','contains');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.bom_exclusions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pattern         TEXT NOT NULL,
  match_type      public.bom_exclusion_match_type NOT NULL DEFAULT 'exact',
  is_seed         BOOLEAN NOT NULL DEFAULT false,
  note            TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bom_exclusions_unique_idx
  ON public.bom_exclusions (organization_id, lower(pattern), match_type);
CREATE INDEX IF NOT EXISTS bom_exclusions_org_idx ON public.bom_exclusions (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bom_exclusions TO authenticated;
GRANT ALL ON public.bom_exclusions TO service_role;

ALTER TABLE public.bom_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read bom_exclusions" ON public.bom_exclusions;
CREATE POLICY "Org members read bom_exclusions"
  ON public.bom_exclusions FOR SELECT TO authenticated
  USING (public.has_org_access(organization_id));

DROP POLICY IF EXISTS "Org admins insert bom_exclusions" ON public.bom_exclusions;
CREATE POLICY "Org admins insert bom_exclusions"
  ON public.bom_exclusions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role])
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Org admins update bom_exclusions" ON public.bom_exclusions;
CREATE POLICY "Org admins update bom_exclusions"
  ON public.bom_exclusions FOR UPDATE TO authenticated
  USING (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role])
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role])
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Org admins delete bom_exclusions" ON public.bom_exclusions;
CREATE POLICY "Org admins delete bom_exclusions"
  ON public.bom_exclusions FOR DELETE TO authenticated
  USING (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role])
    OR public.is_super_admin()
  );

INSERT INTO public.bom_exclusions (organization_id, pattern, match_type, is_seed, note)
SELECT o.id, v.pattern, 'exact'::public.bom_exclusion_match_type, true, 'Default Thumper Fab exclusion'
FROM public.organizations o
CROSS JOIN (VALUES ('TF-Instruct'),('TF000001-01'),('TF041401 PK')) AS v(pattern)
ON CONFLICT DO NOTHING;