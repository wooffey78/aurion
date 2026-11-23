-- Aurion 15 : administration, support conversation, exports complets, trésorerie et facturation abonnement.
alter table clients add column if not exists estimated_minutes numeric(10,2) not null default 30 check (estimated_minutes >= 0);

create table if not exists platform_admins(
  user_id uuid primary key references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists support_messages(
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  author_user_id uuid references users(id) on delete set null,
  author_type varchar(20) not null check(author_type in ('user','admin','system')),
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_messages_ticket on support_messages(ticket_id,created_at);

create table if not exists support_status_events(
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  old_status varchar(30),
  new_status varchar(30) not null,
  author_user_id uuid references users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_status_events_ticket on support_status_events(ticket_id,created_at);

alter table support_tickets add column if not exists duplicate_of uuid references support_tickets(id) on delete set null;
alter table support_tickets add column if not exists closed_at timestamptz;
alter table support_tickets add column if not exists closed_until timestamptz;
alter table support_tickets drop constraint if exists support_tickets_status_check;
alter table support_tickets add constraint support_tickets_status_check check(status in ('open','in_progress','waiting_user','waiting_provider','closed','resolved','duplicate','email_failed'));

create table if not exists subscription_invoices(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  subscription_id uuid references subscriptions(organization_id) on delete set null,
  number varchar(40) not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  amount_ht_cents integer not null,
  vat_rate numeric(5,2) not null default 20,
  total_ttc_cents integer not null,
  status varchar(20) not null default 'issued',
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,period_start)
);
create index if not exists idx_subscription_invoices_org on subscription_invoices(organization_id,created_at desc);

create index if not exists idx_quotes_client_type on quotes(organization_id,client_id,document_type,created_at desc);

-- Suppression définitive de la veille réglementaire.
drop table if exists activity_regulatory_ack cascade;
drop table if exists regulatory_rules cascade;
