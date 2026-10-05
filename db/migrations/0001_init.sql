-- 0001: initial tables, access rules, invites, change log and photo bucket.
-- Applied to Supabase project home-sale-prep (Sydney) on 5 Oct 2026.
-- Nested lists that are always read and written with their parent
-- (tools, materials, quotes, photos) are stored as jsonb to keep it simple.

-- People who can use the app, linked to Supabase logins.
create table members (
  user_id     uuid primary key references auth.users on delete cascade,
  name        text not null,
  role        text not null default 'viewer' check (role in ('owner','editor','viewer')),
  created_at  timestamptz not null default now()
);

-- Invitations. The owner adds a name, email and access level; when that
-- person signs up with the same email, they become a member automatically.
-- Anyone else who signs up gets an account that can see nothing.
create table invites (
  email       text primary key check (email = lower(email)),
  name        text not null,
  role        text not null default 'editor' check (role in ('owner','editor','viewer')),
  invited_at  timestamptz not null default now(),
  invited_by  uuid references auth.users,
  accepted_at timestamptz
);

create table area_groups (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  sort        int not null default 0
);

create table areas (
  slug        text primary key,
  name        text not null,
  group_id    bigint references area_groups on delete set null,
  sort        int not null default 0,
  now_text    text default '',
  sale_text   text default '',
  desc_agreed boolean not null default false,
  tasks_agreed boolean not null default false,
  chosen      text check (chosen in ('low','medium','high','lux')),
  choice_notes text default '',
  options     jsonb not null default '{}',  -- {low:{summary,cost,time,images:[...]}, ...}
  current_photos jsonb not null default '[]',
  inspiration jsonb not null default '[]'
);

create table contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  trade       text default '',
  phone       text default '',
  email       text default '',
  notes       text default ''
);

create table tasks (
  id          text primary key,              -- keeps existing ids (k001, m01, p01...)
  num         int unique,                    -- the number Trene refers to
  title       text not null,
  area        text references areas on delete set null on update cascade,
  type        text,                          -- Admin, Declutter, Clean, Repair, Paint, Upgrade, Style, Garden, Maintenance, Pre-sale
  tier        text check (tier in ('must','worth','agent')),
  who         text check (who in ('DIY','Trade','Either')),
  status      text not null default 'todo' check (status in ('todo','doing','done','dropped')),
  due         text,                          -- YYYY-MM
  cost_low    numeric,
  cost_high   numeric,
  actual      numeric,
  est_hours   numeric,
  act_hours   numeric,
  conf        text check (conf in ('yes','learn','no')),
  skills      text default '',
  tags        text[] not null default '{}',
  tools       jsonb not null default '[]',   -- [{name,qty,have,cost}]
  mats        jsonb not null default '[]',
  links       jsonb not null default '[]',   -- [{title,url}]
  steps       text default '',
  quotes      jsonb not null default '[]',   -- [{id,contactId,from,amount,date,note,file,accepted}]
  after_ids   text[] not null default '{}',  -- tasks this one waits on
  contact_id  uuid references contacts on delete set null,
  repeat_months int check (repeat_months in (1,3,6,12)),
  next_made   boolean not null default false,
  notes       text default ''
);
create index tasks_area_idx on tasks(area);
create index tasks_status_idx on tasks(status);
create index tasks_tags_idx on tasks using gin(tags);

create table documents (
  id          text primary key,
  title       text not null,
  area        text references areas on delete set null on update cascade,
  have        boolean not null default false,
  notes       text default '',
  files       jsonb not null default '[]'
);

create table finishes (
  id          uuid primary key default gen_random_uuid(),
  area        text references areas on delete set null on update cascade,
  item        text not null,
  product     text default '',
  code        text default '',
  sheen       text default '',
  supplier    text default ''
);

create table checklists (
  id          text primary key,              -- e.g. 'openhome'
  items       jsonb not null default '[]'    -- [{t,d}]
);

-- Access rules: any member can read; owners and editors can change.
create function is_member() returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from members where user_id = auth.uid()) $$;
create function can_edit() returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from members where user_id = auth.uid() and role in ('owner','editor')) $$;

create function is_owner() returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from members where user_id = auth.uid() and role = 'owner') $$;

do $$
declare t text;
begin
  foreach t in array array['area_groups','areas','contacts','tasks','documents','finishes','checklists'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "members read" on %I for select to authenticated using (is_member())', t);
    execute format('create policy "editors write" on %I for all to authenticated using (can_edit()) with check (can_edit())', t);
  end loop;
end $$;

alter table members enable row level security;
create policy "members read members" on members for select to authenticated using (is_member());
create policy "owner manages members" on members for all to authenticated
  using (is_owner()) with check (is_owner());

alter table invites enable row level security;
create policy "owner manages invites" on invites for all to authenticated
  using (is_owner()) with check (is_owner());

create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare i invites;
begin
  select * into i from invites where email = lower(new.email) and accepted_at is null;
  if found then
    insert into members(user_id, name, role) values (new.id, i.name, i.role);
    update invites set accepted_at = now() where email = i.email;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Who created and last changed each row.
do $$
declare t text;
begin
  foreach t in array array['area_groups','areas','contacts','tasks','documents','finishes','checklists'] loop
    execute format('alter table %I add column if not exists created_at timestamptz not null default now()', t);
    execute format('alter table %I add column if not exists created_by uuid references auth.users default auth.uid()', t);
    execute format('alter table %I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('alter table %I add column if not exists updated_by uuid references auth.users', t);
  end loop;
end $$;

-- Change log: every insert, update and delete, with who did it and the before and after values.
create table audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  table_name  text not null,
  row_id      text,
  action      text not null check (action in ('insert','update','delete')),
  old_data    jsonb,
  new_data    jsonb
);
create index audit_log_row_idx on audit_log(table_name, row_id);
alter table audit_log enable row level security;
create policy "members read log" on audit_log for select to authenticated using (is_member());
-- No insert, update or delete policies: only the trigger below writes, and nobody can edit the log.

create function audit_and_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

create function audit_write() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log(user_id, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name, coalesce(r->>'id', r->>'slug', r->>'email', r->>'user_id'),
          lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['area_groups','areas','contacts','tasks','documents','finishes','checklists'] loop
    execute format('create trigger stamp before insert or update on %I for each row execute function audit_and_stamp()', t);
    execute format('create trigger audit after insert or update or delete on %I for each row execute function audit_write()', t);
  end loop;
  foreach t in array array['members','invites'] loop
    execute format('create trigger audit after insert or update or delete on %I for each row execute function audit_write()', t);
  end loop;
end $$;

-- Private bucket for photos and files; members read, editors upload and delete.
insert into storage.buckets (id, name, public) values ('house', 'house', false) on conflict do nothing;
create policy "members read files" on storage.objects for select to authenticated
  using (bucket_id = 'house' and public.is_member());
create policy "editors add files" on storage.objects for insert to authenticated
  with check (bucket_id = 'house' and public.can_edit());
create policy "editors change files" on storage.objects for update to authenticated
  using (bucket_id = 'house' and public.can_edit());
create policy "editors delete files" on storage.objects for delete to authenticated
  using (bucket_id = 'house' and public.can_edit());
