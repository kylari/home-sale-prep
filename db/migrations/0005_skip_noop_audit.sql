-- Don't log saves that changed nothing but the timestamps.
create or replace function audit_write() returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  stamps text[] := array['updated_at','updated_by','updated_by_name'];
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) - stamps) = (to_jsonb(new) - stamps) then
    return null;
  end if;
  insert into audit_log(user_id, actor, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), actor_name(), tg_table_name, coalesce(r->>'id', r->>'slug', r->>'email', r->>'user_id'),
          lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
revoke execute on function public.audit_write() from public, anon, authenticated;
