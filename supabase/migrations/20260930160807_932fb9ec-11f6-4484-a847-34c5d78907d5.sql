CREATE TABLE public.org_subscriptions (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_key text NOT NULL DEFAULT 'free' CHECK (plan_key IN ('free','creator','team','operations','enterprise','legacy')),
  billing_interval text CHECK (billing_interval IN ('month','year')),
  billing_status text NOT NULL DEFAULT 'active' CHECK (billing_status IN ('active','trialing','past_due','canceled','incomplete')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  grace_until timestamptz,
  override_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.org_subscriptions TO authenticated;
GRANT ALL ON public.org_subscriptions TO service_role;
ALTER TABLE public.org_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own org plan" ON public.org_subscriptions FOR SELECT TO authenticated
  USING (public.has_org_access(organization_id) OR public.is_super_admin());
CREATE POLICY "Super admin manages plans" ON public.org_subscriptions FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE TRIGGER trg_org_subscriptions_updated BEFORE UPDATE ON public.org_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.org_subscriptions (organization_id, plan_key, override_note)
SELECT id, 'legacy', 'Existing organization — protected legacy plan' FROM public.organizations
ON CONFLICT DO NOTHING;

-- Effective plan (falls back to free when payment lapsed past grace).
CREATE OR REPLACE FUNCTION public.org_effective_plan(_org_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN s.plan_key IS NULL THEN 'free'
    WHEN s.plan_key IN ('legacy','enterprise','free') THEN s.plan_key
    WHEN s.billing_status IN ('active','trialing') THEN s.plan_key
    WHEN s.billing_status = 'past_due' AND coalesce(s.grace_until, now()) >= now() THEN s.plan_key
    ELSE 'free' END
  FROM (SELECT 1) x LEFT JOIN public.org_subscriptions s ON s.organization_id = _org_id;
$$;

CREATE OR REPLACE FUNCTION public.plan_limits(_plan text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _plan
    WHEN 'free' THEN '{"manuals":1,"seats":1,"features":[]}'::jsonb
    WHEN 'creator' THEN '{"manuals":10,"seats":1,"features":["remove_branding","custom_branding"]}'::jsonb
    WHEN 'team' THEN '{"manuals":50,"seats":5,"features":["remove_branding","custom_branding","custom_templates","pdf_import"]}'::jsonb
    WHEN 'operations' THEN '{"manuals":250,"seats":15,"features":["remove_branding","custom_branding","custom_templates","pdf_import","odoo","docsie"]}'::jsonb
    ELSE '{"manuals":null,"seats":null,"features":["remove_branding","custom_branding","custom_templates","pdf_import","odoo","docsie"]}'::jsonb
  END;
$$;

CREATE OR REPLACE FUNCTION public.org_has_feature(_org_id uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.plan_limits(public.org_effective_plan(_org_id))->'features') ? _feature;
$$;

CREATE OR REPLACE FUNCTION public.org_active_manual_count(_org_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.manuals m JOIN public.products p ON p.id = m.product_id
  WHERE p.organization_id = _org_id AND m.lifecycle = 'active';
$$;

CREATE OR REPLACE FUNCTION public.org_usage(_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text;
BEGIN
  IF NOT (public.has_org_access(_org_id) OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  v_plan := public.org_effective_plan(_org_id);
  RETURN jsonb_build_object(
    'plan', v_plan,
    'limits', public.plan_limits(v_plan),
    'manuals', public.org_active_manual_count(_org_id),
    'seats', (SELECT count(*) FROM public.memberships WHERE organization_id = _org_id)
  );
END; $$;

-- DB-level manual limit
CREATE OR REPLACE FUNCTION public.tg_enforce_manual_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_limit int; v_plan text;
BEGIN
  IF NEW.lifecycle <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.lifecycle = 'active' THEN RETURN NEW; END IF;
  SELECT organization_id INTO v_org FROM public.products WHERE id = NEW.product_id;
  v_plan := public.org_effective_plan(v_org);
  v_limit := (public.plan_limits(v_plan)->>'manuals')::int;
  IF v_limit IS NOT NULL AND public.org_active_manual_count(v_org) >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT:manuals:Your % plan allows % active manual(s). Upgrade to add more.', v_plan, v_limit;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_enforce_manual_limit BEFORE INSERT OR UPDATE OF lifecycle ON public.manuals
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_manual_limit();

CREATE OR REPLACE FUNCTION public.tg_enforce_seat_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit int; v_plan text;
BEGIN
  v_plan := public.org_effective_plan(NEW.organization_id);
  v_limit := (public.plan_limits(v_plan)->>'seats')::int;
  IF v_limit IS NOT NULL AND (SELECT count(*) FROM public.memberships WHERE organization_id = NEW.organization_id) >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT:seats:Your % plan allows % seat(s). Upgrade to invite more people.', v_plan, v_limit;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_enforce_seat_limit BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_seat_limit();

-- Manual visibility
CREATE TYPE public.manual_visibility AS ENUM ('public_indexed','public_unlisted','private');
ALTER TABLE public.manuals ADD COLUMN visibility public.manual_visibility NOT NULL DEFAULT 'public_indexed';
ALTER TABLE public.manuals ALTER COLUMN visibility SET DEFAULT 'public_unlisted';

-- New orgs get a free plan row automatically
CREATE OR REPLACE FUNCTION public.tg_org_default_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.org_subscriptions (organization_id, plan_key) VALUES (NEW.id, 'free')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_org_default_subscription AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_org_default_subscription();

-- Self-serve signup: create org when signup metadata includes org_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org_name text; v_base text; v_slug text; v_n int := 0; v_org uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  v_org_name := nullif(trim(NEW.raw_user_meta_data->>'org_name'), '');
  IF v_org_name IS NOT NULL THEN
    v_base := trim(both '-' from regexp_replace(lower(v_org_name), '[^a-z0-9]+', '-', 'g'));
    IF length(v_base) < 2 OR v_base IN ('admin','api','app','auth','dashboard','m','manuals','products','settings','static','support','www') THEN
      v_base := 'org-' || coalesce(nullif(v_base,''), 'new');
    END IF;
    v_base := left(v_base, 55);
    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    END LOOP;
    INSERT INTO public.organizations (name, slug, settings)
    VALUES (left(v_org_name, 120), v_slug,
      jsonb_build_object('use_case', NEW.raw_user_meta_data->>'use_case', 'self_serve', true, 'onboarding_completed', false))
    RETURNING id INTO v_org;
    INSERT INTO public.memberships (organization_id, user_id) VALUES (v_org, NEW.id);
    INSERT INTO public.org_roles (organization_id, user_id, role) VALUES (v_org, NEW.id, 'owner'), (v_org, NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;