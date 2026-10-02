
-- Manual templates (reusable manual skeletons + layout presets)
CREATE TYPE public.manual_template_layout AS ENUM ('classic','compact','field_guide','service_card');

CREATE TABLE public.manual_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  layout public.manual_template_layout NOT NULL DEFAULT 'classic',
  default_content JSONB NOT NULL DEFAULT '{"tools":[],"parts":[],"steps":[],"warnings":[],"torque_specs":[],"images":[]}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX manual_templates_org_idx ON public.manual_templates(organization_id);
CREATE UNIQUE INDEX manual_templates_one_default_per_org
  ON public.manual_templates(organization_id) WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_templates TO authenticated;
GRANT ALL ON public.manual_templates TO service_role;

ALTER TABLE public.manual_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read templates"
  ON public.manual_templates FOR SELECT TO authenticated
  USING (public.has_org_access(organization_id));

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

CREATE TRIGGER manual_templates_updated_at
  BEFORE UPDATE ON public.manual_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Manuals: link to template + provenance
ALTER TABLE public.manuals
  ADD COLUMN template_id UUID REFERENCES public.manual_templates(id) ON DELETE SET NULL,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'authored'; -- 'authored' | 'imported_pdf'

-- Manual versions: optional source pdf for legacy imports
ALTER TABLE public.manual_versions
  ADD COLUMN source_pdf_path TEXT;

-- Storage policies for manual-assets bucket: allow org members to read,
-- and authenticated to write under any path (we control paths server-side).
CREATE POLICY "manual-assets read by org members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'manual-assets'
    AND EXISTS (
      SELECT 1 FROM public.memberships m WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "manual-assets write by authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'manual-assets'
    AND EXISTS (
      SELECT 1 FROM public.memberships m WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "manual-assets update by authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'manual-assets')
  WITH CHECK (bucket_id = 'manual-assets');

CREATE POLICY "manual-assets delete by authenticated"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'manual-assets');
