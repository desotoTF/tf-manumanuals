CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  organization text,
  topic text NOT NULL CHECK (topic IN ('product','support','billing','feature','enterprise')),
  message text NOT NULL,
  ip_hash text,
  handled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read contact messages" ON public.contact_messages FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "Super admins update contact messages" ON public.contact_messages FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE INDEX contact_messages_ip_recent ON public.contact_messages (ip_hash, created_at DESC);