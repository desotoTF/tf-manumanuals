
CREATE TABLE IF NOT EXISTS public.platform_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_audit_occurred_at_idx
  ON public.platform_audit (occurred_at DESC);

GRANT SELECT ON public.platform_audit TO authenticated;
GRANT ALL ON public.platform_audit TO service_role;

ALTER TABLE public.platform_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read platform audit" ON public.platform_audit;
CREATE POLICY "Super admins read platform audit" ON public.platform_audit
  FOR SELECT TO authenticated
  USING (public.is_super_admin());
