create table if not exists supplies(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
 activity_id uuid not null references activities(id) on delete cascade, supplier_id uuid references suppliers(id) on delete set null,
 name varchar(240) not null, reference varchar(160), description text, purchase_price numeric(12,2) not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_supplies_activity on supplies(activity_id,name);
