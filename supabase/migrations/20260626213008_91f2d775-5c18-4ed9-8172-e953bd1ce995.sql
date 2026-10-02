
-- Enable case-insensitive text type for tool name dedupe
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- tools: org-scoped reusable tool library
-- ============================================================
CREATE TABLE public.tools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            CITEXT NOT NULL,
  spec            TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tools_org_name_unique UNIQUE (organization_id, name)
);

CREATE INDEX tools_org_idx ON public.tools (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tools TO authenticated;
GRANT ALL ON public.tools TO service_role;

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read tools"
  ON public.tools FOR SELECT TO authenticated
  USING (public.has_org_access(organization_id));

CREATE POLICY "Org admins insert tools"
  ON public.tools FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_access(organization_id)
  );

CREATE POLICY "Org admins update tools"
  ON public.tools FOR UPDATE TO authenticated
  USING (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role, 'editor'::org_role])
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role, 'editor'::org_role])
    OR public.is_super_admin()
  );

CREATE POLICY "Org admins delete tools"
  ON public.tools FOR DELETE TO authenticated
  USING (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  );

CREATE TRIGGER tools_set_updated_at
  BEFORE UPDATE ON public.tools
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- bom_exclusions: org-scoped patterns to drop from BOM autofill
-- ============================================================
CREATE TYPE public.bom_exclusion_match_type AS ENUM ('exact', 'prefix', 'suffix', 'contains');

CREATE TABLE public.bom_exclusions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pattern         TEXT NOT NULL,
  match_type      public.bom_exclusion_match_type NOT NULL DEFAULT 'exact',
  is_seed         BOOLEAN NOT NULL DEFAULT false,
  note            TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bom_exclusions_unique_idx
  ON public.bom_exclusions (organization_id, lower(pattern), match_type);
CREATE INDEX bom_exclusions_org_idx ON public.bom_exclusions (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bom_exclusions TO authenticated;
GRANT ALL ON public.bom_exclusions TO service_role;

ALTER TABLE public.bom_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read bom_exclusions"
  ON public.bom_exclusions FOR SELECT TO authenticated
  USING (public.has_org_access(organization_id));

CREATE POLICY "Org admins insert bom_exclusions"
  ON public.bom_exclusions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  );

CREATE POLICY "Org admins update bom_exclusions"
  ON public.bom_exclusions FOR UPDATE TO authenticated
  USING (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  );

CREATE POLICY "Org admins delete bom_exclusions"
  ON public.bom_exclusions FOR DELETE TO authenticated
  USING (
    public.has_org_any_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role])
    OR public.is_super_admin()
  );

-- Seed default exclusions for every existing organization. New orgs get
-- their seeds via the seedDefaultExclusions server fn on first list.
INSERT INTO public.bom_exclusions (organization_id, pattern, match_type, is_seed, note)
SELECT o.id, v.pattern, 'exact'::public.bom_exclusion_match_type, true, 'Default Thumper Fab exclusion'
FROM public.organizations o
CROSS JOIN (VALUES
  ('TF-Instruct'),
  ('TF000001-01'),
  ('TF041401 PK')
) AS v(pattern)
ON CONFLICT DO NOTHING;
