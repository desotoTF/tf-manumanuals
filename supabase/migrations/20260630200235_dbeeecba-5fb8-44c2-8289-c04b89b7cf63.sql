create or replace function public._tmp_erp_read(_id uuid) returns jsonb language plpgsql security definer set search_path=public,vault as $$
declare v_secret_id uuid; v text;
begin
  select vault_secret_id into v_secret_id from public.erp_connections where id=_id;
  select decrypted_secret into v from vault.decrypted_secrets where id=v_secret_id;
  return v::jsonb;
end$$;
grant execute on function public._tmp_erp_read(uuid) to service_role;