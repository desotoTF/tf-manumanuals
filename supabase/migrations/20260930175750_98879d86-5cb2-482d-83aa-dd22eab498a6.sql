CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'general' CHECK (kind IN ('general','bug','idea','post_publish')),
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  page text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users submit own feedback" ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (organization_id IS NULL OR public.has_org_access(organization_id)));
CREATE POLICY "Users read own feedback, super admins read all" ON public.feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());