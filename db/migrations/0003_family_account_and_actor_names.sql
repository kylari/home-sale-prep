-- Match fields the old page already used.
alter table documents alter column have drop default;
alter table documents alter column have type text using case when have then 'have' else 'need' end;
alter table documents alter column have set default 'need';
alter table documents add column category text default '', add column issued text default '', add column expires text default '';
alter table tasks add column materials text default '';

-- Who did it: the app sends the person's chosen name in an x-actor header.
create or replace function public.actor_name() returns text language sql stable as $$
  select nullif(left(coalesce(current_setting('request.headers', true)::json->>'x-actor', ''), 80), '')
$$;
alter table audit_log add column actor text;

do $$
declare t text;
begin
  foreach t in array array['area_groups','areas','contacts','tasks','documents','finishes','checklists'] loop
    execute format('alter table %I add column created_by_name text default public.actor_name()', t);
    execute format('alter table %I add column updated_by_name text', t);
  end loop;
end $$;

create or replace function audit_and_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_name := actor_name();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
  end if;
  return new;
end $$;
revoke execute on function public.audit_and_stamp() from public, anon, authenticated;

-- The shared family login was created directly in auth.users with only a
-- bcrypt hash of its password (the password itself is not in this repo).
-- Invites kept for when personal logins are wanted later:
--   family@home.sabav2v.com (owner), petrinamcculloch@gmail.com (owner)

-- Live updates between devices.
alter publication supabase_realtime add table area_groups, areas, contacts, tasks, documents, finishes, checklists;
