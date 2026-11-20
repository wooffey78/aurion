alter table warranties add column if not exists scope_type varchar(30) not null default 'both';
create index if not exists idx_warranties_quote_active on warranties(quote_id,ends_at desc);
create table if not exists sav_cases(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  invoice_id uuid references quotes(id) on delete set null,
  amount_ttc numeric(12,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_sav_cases_org_activity on sav_cases(organization_id,activity_id,created_at desc);
