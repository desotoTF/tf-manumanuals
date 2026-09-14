ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_sync_placeholder boolean NOT NULL DEFAULT false;

UPDATE public.products SET is_sync_placeholder = true WHERE sku LIKE 'ODOO-TMPL-%';

CREATE INDEX IF NOT EXISTS products_sync_placeholder_idx ON public.products (organization_id) WHERE is_sync_placeholder;