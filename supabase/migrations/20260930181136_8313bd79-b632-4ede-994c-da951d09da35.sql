CREATE TABLE public.manual_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  manual_id uuid NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
  referrer_host text,
  source text,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manual_views_manual_idx ON public.manual_views(manual_id, viewed_at DESC);
GRANT SELECT ON public.manual_views TO authenticated;
GRANT ALL ON public.manual_views TO service_role;
ALTER TABLE public.manual_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read their manual views" ON public.manual_views
  FOR SELECT TO authenticated USING (public.has_org_access(organization_id) OR public.is_super_admin());