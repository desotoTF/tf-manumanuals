
ALTER TABLE public.manual_templates
  ADD COLUMN IF NOT EXISTS branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_master BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS manual_templates_one_master_per_org
  ON public.manual_templates(organization_id) WHERE is_master;

-- Seed ThumperFab master template
INSERT INTO public.manual_templates (organization_id, name, description, layout, is_default, is_master, default_content, branding)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'ThumperFab Master',
  'Brand-wide layout, colors, fonts, and footer. Every manual renders through this template.',
  'classic',
  false,
  true,
  '{"tools":[],"parts":[],"hardware_kit":[],"steps":[],"warnings":[],"torque_specs":[],"images":[],"pages":[]}'::jsonb,
  jsonb_build_object(
    'logo_url', '',
    'colors', jsonb_build_object(
      'brand', '#E11D2A',
      'ink', '#111111',
      'muted', '#4B4B4B',
      'tableHeaderBg', '#E11D2A',
      'tableHeaderFg', '#FFFFFF'
    ),
    'fonts', jsonb_build_object(
      'heading', 'Barlow Condensed',
      'body', 'Barlow',
      'headingWeight', 700,
      'bodyWeight', 400
    ),
    'cover', jsonb_build_object(
      'tagline', 'Aluminum Audio Roofs • Roll Cages • UTV Accessories',
      'showHero', true,
      'versionLabelPrefix', 'Ver.'
    ),
    'header', jsonb_build_object('show', true, 'showSku', true),
    'footer', jsonb_build_object(
      'companyName', 'Thumper Fab',
      'address', '5103 Elysian Fields Rd, Marshall, TX 75672',
      'phone', '903-472-0928',
      'website', 'www.thumperfab.com'
    ),
    'tables', jsonb_build_object(
      'partsHeaderUppercase', true,
      'zebra', false,
      'borderColor', '#111111'
    )
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.manual_templates
  WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid AND is_master
);
