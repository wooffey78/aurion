alter table subscriptions add column if not exists data_read_only_until timestamptz;
alter table subscriptions add column if not exists payment_method varchar(30);
alter table subscriptions add column if not exists billing_reference varchar(120);
update subscriptions set data_read_only_until=coalesce(data_read_only_until,trial_ends_at+interval '60 days') where trial_ends_at is not null;
create table if not exists billing_payment_requests(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
 plan_code varchar(40) not null references plans(code), method varchar(30) not null check(method in ('bank_transfer','card')),
 reference varchar(120) not null unique, amount_ttc_cents integer not null, status varchar(30) not null default 'pending' check(status in ('pending','paid','canceled')),
 provider_session_id varchar(200), created_at timestamptz not null default now(), paid_at timestamptz
);
create index if not exists idx_billing_payment_requests_org on billing_payment_requests(organization_id,created_at desc);
