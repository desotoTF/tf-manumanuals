
-- =========================================================================
-- ENUMS
-- =========================================================================
CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
CREATE TYPE public.erp_provider AS ENUM ('odoo', 'netsuite', 'dynamics365', 'epicor', 'infor', 'other');
CREATE TYPE public.erp_credential_action AS ENUM ('created', 'rotated', 'revoked');
CREATE TYPE public.manual_lifecycle AS ENUM ('active', 'archived');
CREATE TYPE public.manual_version_state AS ENUM ('draft', 'in_review', 'approved', 'published', 'superseded');
CREATE TYPE public.manual_asset_type AS ENUM ('image', 'diagram', 'video_reference');
CREATE TYPE public.sync_event_type AS ENUM (
  'bom_sync_started', 'bom_sync_succeeded', 'bom_sync_failed',
  'bom_change_detected', 'manual_published', 'manual_state_changed'
);
CREATE TYPE public.manual_sync_status_kind AS ENUM ('in_sync', 'out_of_sync', 'no_manual', 'pending_review');

-- =========================================================================
-- updated_at helper
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================================
-- ORGANIZATIONS
-- =========================================================================
CREATE TABLE public.organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- PROFILES
-- =========================================================================
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-create a profile row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- MEMBERSHIPS + ROLES (roles in a SEPARATE table per security guidance)
-- =========================================================================
CREATE TABLE public.memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.org_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            public.org_role NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_roles TO authenticated;
GRANT ALL ON public.org_roles TO service_role;
ALTER TABLE public.org_roles ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- SECURITY DEFINER access helpers (avoid RLS recursion)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.has_org_access(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE organization_id = _org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id UUID, _role public.org_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_roles
    WHERE organization_id = _org_id AND user_id = auth.uid() AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_any_role(_org_id UUID, _roles public.org_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_roles
    WHERE organization_id = _org_id AND user_id = auth.uid() AND role = ANY(_roles)
  );
$$;

-- =========================================================================
-- RLS policies for orgs / memberships / roles
-- =========================================================================
CREATE POLICY "members read their orgs" ON public.organizations
  FOR SELECT TO authenticated USING (public.has_org_access(id));
CREATE POLICY "admins update their orgs" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.has_org_any_role(id, ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_any_role(id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "members read memberships in their org" ON public.memberships
  FOR SELECT TO authenticated USING (public.has_org_access(organization_id));
CREATE POLICY "admins manage memberships" ON public.memberships
  FOR ALL TO authenticated
  USING (public.has_org_any_role(organization_id, ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_any_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "members read org roles" ON public.org_roles
  FOR SELECT TO authenticated USING (public.has_org_access(organization_id));
CREATE POLICY "admins manage org roles" ON public.org_roles
  FOR ALL TO authenticated
  USING (public.has_org_any_role(organization_id, ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_any_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

-- =========================================================================
-- INVITATIONS
-- =========================================================================
CREATE TABLE public.invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            public.org_role NOT NULL DEFAULT 'editor',
  token_hash      TEXT NOT NULL UNIQUE,
  invited_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  accepted_at     TIMESTAMPTZ,
  accepted_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage invitations" ON public.invitations
  FOR ALL TO authenticated
  USING (public.has_org_any_role(organization_id, ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_any_role(organization_id, ARRAY['owner','admin']::public.org_role[]));
-- Note: token-based acceptance happens via server-side admin client, not RLS.

-- =========================================================================
-- ERP CONNECTIONS (no api_key column – references a Cloud secret name)
-- =========================================================================
CREATE TABLE public.erp_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider            public.erp_provider NOT NULL DEFAULT 'odoo',
  name                TEXT NOT NULL,
  base_url            TEXT NOT NULL,
  database            TEXT,
  username            TEXT NOT NULL,
  secret_name         TEXT NOT NULL,           -- e.g. ERP_CRED_<uuid>
  credentials_version INT NOT NULL DEFAULT 1,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  last_sync_at        TIMESTAMPTZ,
  last_sync_status    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_connections TO authenticated;
GRANT ALL ON public.erp_connections TO service_role;
ALTER TABLE public.erp_connections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_erp_connections_updated BEFORE UPDATE ON public.erp_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "members read erp connections" ON public.erp_connections
  FOR SELECT TO authenticated USING (public.has_org_access(organization_id));
CREATE POLICY "admins manage erp connections" ON public.erp_connections
  FOR ALL TO authenticated
  USING (public.has_org_any_role(organization_id, ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_any_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

CREATE TABLE public.erp_credential_audit (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_connection_id   UUID NOT NULL REFERENCES public.erp_connections(id) ON DELETE CASCADE,
  action              public.erp_credential_action NOT NULL,
  actor_user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note                TEXT,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.erp_credential_audit TO authenticated;
GRANT ALL ON public.erp_credential_audit TO service_role;
ALTER TABLE public.erp_credential_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read credential audit" ON public.erp_credential_audit
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.erp_connections c
    WHERE c.id = erp_connection_id
      AND public.has_org_any_role(c.organization_id, ARRAY['owner','admin']::public.org_role[])
  ));

-- =========================================================================
-- PRODUCTS (logical SKUs)
-- =========================================================================
CREATE TABLE public.products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  erp_connection_id  UUID REFERENCES public.erp_connections(id) ON DELETE SET NULL,
  erp_product_id     TEXT,
  sku                TEXT NOT NULL,
  name               TEXT NOT NULL,
  description        TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  web_slug           TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sku),
  UNIQUE (organization_id, web_slug)
);
CREATE INDEX idx_products_org ON public.products(organization_id);
CREATE INDEX idx_products_erp ON public.products(erp_connection_id, erp_product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "members read products" ON public.products
  FOR SELECT TO authenticated USING (public.has_org_access(organization_id));
CREATE POLICY "editors manage products" ON public.products
  FOR ALL TO authenticated
  USING (public.has_org_any_role(organization_id, ARRAY['owner','admin','editor']::public.org_role[]))
  WITH CHECK (public.has_org_any_role(organization_id, ARRAY['owner','admin','editor']::public.org_role[]));

-- =========================================================================
-- BOM SNAPSHOTS
-- =========================================================================
CREATE TABLE public.bom_snapshots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  erp_connection_id  UUID REFERENCES public.erp_connections(id) ON DELETE SET NULL,
  erp_bom_id         TEXT,
  erp_bom_revision   TEXT,
  raw_payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_items   JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_hash       TEXT NOT NULL,
  captured_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, content_hash)
);
CREATE INDEX idx_bom_product_captured ON public.bom_snapshots(product_id, captured_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bom_snapshots TO authenticated;
GRANT ALL ON public.bom_snapshots TO service_role;
ALTER TABLE public.bom_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read bom snapshots" ON public.bom_snapshots
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_id AND public.has_org_access(p.organization_id)
  ));
CREATE POLICY "editors insert bom snapshots" ON public.bom_snapshots
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_id
      AND public.has_org_any_role(p.organization_id, ARRAY['owner','admin','editor']::public.org_role[])
  ));

-- =========================================================================
-- MANUALS
-- =========================================================================
CREATE TABLE public.manuals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  lifecycle   public.manual_lifecycle NOT NULL DEFAULT 'active',
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_manuals_product ON public.manuals(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manuals TO authenticated;
GRANT ALL ON public.manuals TO service_role;
ALTER TABLE public.manuals ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_manuals_updated BEFORE UPDATE ON public.manuals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "members read manuals" ON public.manuals
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_id AND public.has_org_access(p.organization_id)
  ));
CREATE POLICY "editors manage manuals" ON public.manuals
  FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_id
      AND public.has_org_any_role(p.organization_id, ARRAY['owner','admin','editor']::public.org_role[])
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_id
      AND public.has_org_any_role(p.organization_id, ARRAY['owner','admin','editor']::public.org_role[])
  ));

-- =========================================================================
-- MANUAL VERSIONS
-- =========================================================================
CREATE TABLE public.manual_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id        UUID NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
  version_number   INT NOT NULL,
  bom_snapshot_id  UUID REFERENCES public.bom_snapshots(id) ON DELETE SET NULL,
  state            public.manual_version_state NOT NULL DEFAULT 'draft',
  content          JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_summary   TEXT,
  pdf_url          TEXT,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manual_id, version_number)
);
CREATE INDEX idx_versions_manual_state ON public.manual_versions(manual_id, state);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_versions TO authenticated;
GRANT ALL ON public.manual_versions TO service_role;
ALTER TABLE public.manual_versions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_manual_versions_updated BEFORE UPDATE ON public.manual_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "members read manual versions" ON public.manual_versions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.manuals m
    JOIN public.products p ON p.id = m.product_id
    WHERE m.id = manual_id AND public.has_org_access(p.organization_id)
  ));
CREATE POLICY "editors manage manual versions" ON public.manual_versions
  FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM public.manuals m
    JOIN public.products p ON p.id = m.product_id
    WHERE m.id = manual_id
      AND public.has_org_any_role(p.organization_id, ARRAY['owner','admin','editor']::public.org_role[])
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.manuals m
    JOIN public.products p ON p.id = m.product_id
    WHERE m.id = manual_id
      AND public.has_org_any_role(p.organization_id, ARRAY['owner','admin','editor']::public.org_role[])
  ));

-- Helper: next version number for a manual
CREATE OR REPLACE FUNCTION public.next_manual_version_number(_manual_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(version_number), 0) + 1
  FROM public.manual_versions
  WHERE manual_id = _manual_id;
$$;

-- =========================================================================
-- MANUAL ASSETS
-- =========================================================================
CREATE TABLE public.manual_assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_version_id  UUID NOT NULL REFERENCES public.manual_versions(id) ON DELETE CASCADE,
  type               public.manual_asset_type NOT NULL DEFAULT 'image',
  storage_path       TEXT,
  url                TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assets_version ON public.manual_assets(manual_version_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_assets TO authenticated;
GRANT ALL ON public.manual_assets TO service_role;
ALTER TABLE public.manual_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read manual assets" ON public.manual_assets
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.manual_versions v
    JOIN public.manuals m ON m.id = v.manual_id
    JOIN public.products p ON p.id = m.product_id
    WHERE v.id = manual_version_id AND public.has_org_access(p.organization_id)
  ));
CREATE POLICY "editors manage manual assets" ON public.manual_assets
  FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM public.manual_versions v
    JOIN public.manuals m ON m.id = v.manual_id
    JOIN public.products p ON p.id = m.product_id
    WHERE v.id = manual_version_id
      AND public.has_org_any_role(p.organization_id, ARRAY['owner','admin','editor']::public.org_role[])
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.manual_versions v
    JOIN public.manuals m ON m.id = v.manual_id
    JOIN public.products p ON p.id = m.product_id
    WHERE v.id = manual_version_id
      AND public.has_org_any_role(p.organization_id, ARRAY['owner','admin','editor']::public.org_role[])
  ));

-- =========================================================================
-- SYNC EVENTS
-- =========================================================================
CREATE TABLE public.sync_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  erp_connection_id  UUID REFERENCES public.erp_connections(id) ON DELETE SET NULL,
  product_id         UUID REFERENCES public.products(id) ON DELETE SET NULL,
  event_type         public.sync_event_type NOT NULL,
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_events_org_time ON public.sync_events(organization_id, occurred_at DESC);
GRANT SELECT, INSERT ON public.sync_events TO authenticated;
GRANT ALL ON public.sync_events TO service_role;
ALTER TABLE public.sync_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read sync events" ON public.sync_events
  FOR SELECT TO authenticated USING (public.has_org_access(organization_id));

-- =========================================================================
-- MANUAL SYNC STATUS (denormalized state per product)
-- =========================================================================
CREATE TABLE public.manual_sync_status (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id                 UUID NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  current_bom_snapshot_id    UUID REFERENCES public.bom_snapshots(id) ON DELETE SET NULL,
  latest_published_version_id UUID REFERENCES public.manual_versions(id) ON DELETE SET NULL,
  status                     public.manual_sync_status_kind NOT NULL DEFAULT 'no_manual',
  last_bom_change_at         TIMESTAMPTZ,
  last_manual_publish_at     TIMESTAMPTZ,
  out_of_sync_since          TIMESTAMPTZ,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_status_status ON public.manual_sync_status(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_sync_status TO authenticated;
GRANT ALL ON public.manual_sync_status TO service_role;
ALTER TABLE public.manual_sync_status ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_mss_updated BEFORE UPDATE ON public.manual_sync_status
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "members read manual sync status" ON public.manual_sync_status
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_id AND public.has_org_access(p.organization_id)
  ));

-- =========================================================================
-- Status recompute function
-- =========================================================================
CREATE OR REPLACE FUNCTION public.recompute_manual_sync_status(_product_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_bom        public.bom_snapshots%ROWTYPE;
  v_published         public.manual_versions%ROWTYPE;
  v_in_review_count   INT;
  v_status            public.manual_sync_status_kind;
  v_oos_since         TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_latest_bom
    FROM public.bom_snapshots
    WHERE product_id = _product_id
    ORDER BY captured_at DESC
    LIMIT 1;

  SELECT v.* INTO v_published
    FROM public.manual_versions v
    JOIN public.manuals m ON m.id = v.manual_id
    WHERE m.product_id = _product_id
      AND v.state = 'published'
    ORDER BY v.published_at DESC NULLS LAST
    LIMIT 1;

  SELECT COUNT(*) INTO v_in_review_count
    FROM public.manual_versions v
    JOIN public.manuals m ON m.id = v.manual_id
    WHERE m.product_id = _product_id
      AND v.state IN ('in_review', 'approved');

  IF v_published.id IS NULL THEN
    -- No published manual yet. If a draft/in-review exists we still call it no_manual until publish.
    v_status := 'no_manual';
    v_oos_since := NULL;
  ELSIF v_latest_bom.id IS NULL THEN
    v_status := 'in_sync';
    v_oos_since := NULL;
  ELSIF v_published.bom_snapshot_id IS DISTINCT FROM v_latest_bom.id THEN
    v_status := 'out_of_sync';
    -- Preserve existing out_of_sync_since if already set
    SELECT out_of_sync_since INTO v_oos_since
      FROM public.manual_sync_status WHERE product_id = _product_id;
    IF v_oos_since IS NULL THEN
      v_oos_since := now();
    END IF;
  ELSE
    v_status := 'in_sync';
    v_oos_since := NULL;
  END IF;

  IF v_in_review_count > 0 AND v_status <> 'out_of_sync' THEN
    v_status := 'pending_review';
  END IF;

  INSERT INTO public.manual_sync_status (
    product_id, current_bom_snapshot_id, latest_published_version_id,
    status, last_bom_change_at, last_manual_publish_at, out_of_sync_since
  )
  VALUES (
    _product_id, v_latest_bom.id, v_published.id,
    v_status, v_latest_bom.captured_at, v_published.published_at, v_oos_since
  )
  ON CONFLICT (product_id) DO UPDATE SET
    current_bom_snapshot_id     = EXCLUDED.current_bom_snapshot_id,
    latest_published_version_id = EXCLUDED.latest_published_version_id,
    status                      = EXCLUDED.status,
    last_bom_change_at          = EXCLUDED.last_bom_change_at,
    last_manual_publish_at      = EXCLUDED.last_manual_publish_at,
    out_of_sync_since           = EXCLUDED.out_of_sync_since,
    updated_at                  = now();
END;
$$;

-- Trigger: when a product is created, seed a sync status row
CREATE OR REPLACE FUNCTION public.tg_product_seed_sync_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_manual_sync_status(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_product_seed_sync_status
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_seed_sync_status();

-- Trigger: when a new BOM snapshot is inserted, recompute status
CREATE OR REPLACE FUNCTION public.tg_bom_recompute_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_manual_sync_status(NEW.product_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_bom_recompute_sync
  AFTER INSERT ON public.bom_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tg_bom_recompute_sync();

-- Trigger: on manual_versions state transitions, supersede prior published + recompute
CREATE OR REPLACE FUNCTION public.tg_version_state_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  SELECT product_id INTO v_product_id FROM public.manuals WHERE id = NEW.manual_id;

  IF NEW.state = 'published'
     AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM 'published') THEN
    -- Stamp published_at if not set
    IF NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
    -- Supersede prior published versions of the same manual
    UPDATE public.manual_versions
       SET state = 'superseded'
     WHERE manual_id = NEW.manual_id
       AND id <> NEW.id
       AND state = 'published';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_version_state_change_biu
  BEFORE INSERT OR UPDATE OF state ON public.manual_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_version_state_change();

CREATE OR REPLACE FUNCTION public.tg_version_recompute_after()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  SELECT product_id INTO v_product_id FROM public.manuals WHERE id = NEW.manual_id;
  IF v_product_id IS NOT NULL THEN
    PERFORM public.recompute_manual_sync_status(v_product_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_version_recompute_after
  AFTER INSERT OR UPDATE OF state ON public.manual_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_version_recompute_after();

-- =========================================================================
-- DEMO ORG SEED
-- =========================================================================
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'ManuManuals Demo', 'demo')
ON CONFLICT DO NOTHING;

-- Seed a few demo products so the dashboard isn't empty.
INSERT INTO public.products (organization_id, sku, name, description, web_slug)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'PUMP-A1', 'Industrial Pump A1', 'Centrifugal pump, 1.5kW', 'pump-a1'),
  ('00000000-0000-0000-0000-000000000001', 'CONV-B2', 'Conveyor Belt B2', '2m modular conveyor section', 'conv-b2'),
  ('00000000-0000-0000-0000-000000000001', 'VALV-C3', 'Pressure Valve C3', '3-way pressure relief valve', 'valv-c3')
ON CONFLICT DO NOTHING;
