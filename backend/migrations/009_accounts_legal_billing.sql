-- Aurion 14 : comptes sécurisés, documents légaux versionnés, abonnement (architecture ; paiement désactivé).
alter table users add column if not exists full_name varchar(160);
alter table users add column if not exists session_version integer not null default 0;
alter table users add column if not exists password_changed_at timestamptz;

create table if not exists password_reset_tokens(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  request_ip_hash char(64),
  created_at timestamptz not null default now()
);
create index if not exists idx_reset_tokens_user on password_reset_tokens(user_id, created_at desc);

create table if not exists legal_documents(
  id uuid primary key default gen_random_uuid(),
  kind varchar(40) not null,
  version varchar(40) not null,
  title varchar(200) not null,
  body text not null,
  is_current boolean not null default false,
  is_draft boolean not null default true,
  published_at timestamptz not null default now(),
  unique(kind, version)
);
create table if not exists legal_acceptances(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  document_id uuid not null references legal_documents(id),
  accepted_at timestamptz not null default now(),
  ip_hash char(64)
);
create index if not exists idx_legal_acceptances_user on legal_acceptances(user_id, accepted_at desc);

create table if not exists plans(
  code varchar(40) primary key,
  name varchar(120) not null,
  price_ht_cents integer not null check (price_ht_cents >= 0),
  billing_interval varchar(10) not null check (billing_interval in ('month','year')),
  trial_days integer not null default 60,
  active boolean not null default true
);
insert into plans(code,name,price_ht_cents,billing_interval,trial_days) values
  ('monthly','Aurion mensuel',1990,'month',60),
  ('yearly','Aurion annuel',19900,'year',60)
on conflict(code) do nothing;

create table if not exists subscriptions(
  organization_id uuid primary key references organizations(id) on delete cascade,
  plan_code varchar(40) references plans(code),
  status varchar(20) not null default 'trialing' check (status in ('trialing','active','past_due','canceled','expired')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  provider varchar(40),
  provider_customer_id varchar(120),
  provider_subscription_id varchar(120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists subscription_events(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind varchar(40) not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_subscription_events_org on subscription_events(organization_id, created_at desc);
create table if not exists billing_webhook_events(
  id uuid primary key default gen_random_uuid(),
  provider varchar(40) not null,
  event_id varchar(200) not null,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider, event_id)
);

-- Comptes existants : essai de 60 jours à compter de la mise à jour (aucun prélèvement, aucune carte requise).
insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at)
select id,'trialing',now(),now()+interval '60 days' from organizations
on conflict(organization_id) do nothing;
