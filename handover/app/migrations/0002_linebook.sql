-- Linebook floor: shared checklist, handover notes, and a supervisor paper trail.

create table if not exists profiles (
  user_id text primary key references "user" ("id") on delete cascade,
  display_name text not null,
  email text,
  role text not null check (role in ('technician', 'supervisor')),
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on profiles (role);

create table if not exists floor_settings (
  id integer primary key check (id = 1),
  floor_name text not null,
  supervisor_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists work_items (
  id serial primary key,
  title text not null,
  detail text not null default '',
  status text not null default 'open' check (status in ('open', 'done')),
  assignee_id text references profiles (user_id),
  created_by text not null references profiles (user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by text references profiles (user_id)
);

create index if not exists work_items_status_idx on work_items (status, assignee_id);

create table if not exists notes (
  id serial primary key,
  item_id integer references work_items (id) on delete cascade,
  kind text not null check (kind in ('handover', 'item')),
  body text not null,
  author_id text not null references profiles (user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  acknowledged_by text references profiles (user_id),
  acknowledged_at timestamptz
);

create index if not exists notes_created_idx on notes (created_at desc);

create table if not exists audit_events (
  id serial primary key,
  actor_id text not null references profiles (user_id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  summary text not null,
  before_json text,
  after_json text,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_idx on audit_events (created_at desc);
