-- Add template-controlled block module configuration and product template SKU fields

-- 1) Template configuration: which block types are allowed and any custom module presets
ALTER TABLE public.manual_templates
  ADD COLUMN IF NOT EXISTS allowed_blocks jsonb NOT NULL DEFAULT '["text","image","two_column","callout","table","figure_row"]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_modules jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Product: track Odoo template-level reference + display SKU
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS erp_template_id text,
  ADD COLUMN IF NOT EXISTS template_sku text;
