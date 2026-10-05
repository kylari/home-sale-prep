-- Any field the app sends that has no column of its own is kept here, so nothing is lost.
alter table areas add column extra jsonb not null default '{}';
alter table contacts add column extra jsonb not null default '{}';
alter table tasks add column extra jsonb not null default '{}';
alter table documents add column extra jsonb not null default '{}';
alter table finishes add column extra jsonb not null default '{}';
alter table checklists add column extra jsonb not null default '{}';
alter table contacts add column role text default '', add column company text default '', add column rating int;
