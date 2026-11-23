create table if not exists support_tickets(
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  number varchar(40) not null,
  category varchar(80) not null,
  message text not null,
  status varchar(30) not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,number)
);
create index if not exists idx_support_tickets_org on support_tickets(organization_id,created_at desc);

create table if not exists client_time_sessions(
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  activity_id uuid references activities(id) on delete set null,
  manual_minutes numeric(10,2) not null check(manual_minutes>=0),
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_client_time_org on client_time_sessions(organization_id,created_at desc);
create unique index if not exists idx_client_time_active_user on client_time_sessions(user_id) where ended_at is null;
alter table document_themes add column if not exists quote_template_style varchar(30) not null default 'aurion-classic';
alter table document_themes add column if not exists invoice_template_style varchar(30) not null default 'aurion-classic';
