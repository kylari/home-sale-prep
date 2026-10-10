-- Furniture and decor list (the page's "items" collection, added 8 Oct 2026).
-- Area is plain text, not a link to areas, so an item survives a space being renamed or removed.
create table items (
  id          text primary key,
  area        text,
  name        text not null default '',
  category    text default '',
  action      text default '',        -- keep, move, store, declutter, donate, sell, dump, hire, buy
  to_area     text default '',
  status      text default 'todo',
  ok          boolean not null default false,   -- confirmed by Trene (false = suggested)
  task        text default '',        -- linked task number
  cost        text default '',
  value       text default '',
  per_month   text default '',
  notes       text default '',
  photo       jsonb,                  -- {id, box:[x,y,w,h]} crop of a Before photo
  extra       jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users default auth.uid(),
  created_by_name text default public.actor_name(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users,
  updated_by_name text
);

alter table items enable row level security;
create policy "members read" on items for select to authenticated using (is_member());
create policy "editors write" on items for all to authenticated using (can_edit()) with check (can_edit());

create trigger stamp before insert or update on items for each row execute function audit_and_stamp();
create trigger audit after insert or update or delete on items for each row execute function audit_write();

alter publication supabase_realtime add table items;
