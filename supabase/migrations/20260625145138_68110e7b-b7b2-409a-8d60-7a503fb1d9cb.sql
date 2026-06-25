
CREATE UNIQUE INDEX IF NOT EXISTS products_org_conn_erp_uidx
  ON public.products (organization_id, erp_connection_id, erp_product_id)
  WHERE erp_connection_id IS NOT NULL;
