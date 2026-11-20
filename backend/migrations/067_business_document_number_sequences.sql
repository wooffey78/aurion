-- Atomically allocate organization-scoped quote and invoice numbers across app instances.
create table if not exists document_number_sequences(
  organization_id uuid not null references organizations(id) on delete cascade,
  prefix varchar(10) not null check(prefix in ('DEV','FAC')),
  year integer not null check(year between 2000 and 9999),
  last_value bigint not null check(last_value>0),
  updated_at timestamptz not null default now(),
  primary key(organization_id,prefix,year)
);
