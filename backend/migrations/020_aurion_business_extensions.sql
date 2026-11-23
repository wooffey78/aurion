create sequence if not exists aurion_support_ticket_seq;

-- Aurion 15.1 : marge sécurisée, paiements, relances, fournisseurs, facture électronique et reprise d'onboarding.
-- Migration additive : aucune migration historique n'est modifiée.

alter table organizations add column if not exists configuration_incomplete boolean not null default true;
alter table client_time_sessions add column if not exists status varchar(20) not null default 'running';
alter table client_time_sessions drop constraint if exists client_time_sessions_status_check;
alter table client_time_sessions add constraint client_time_sessions_status_check check(status in ('running','completed','abandoned'));

alter table activities add column if not exists margin_min_percent numeric(8,4) not null default 0.01 check (margin_min_percent >= 0);
create index if not exists idx_activities_margin on activities(organization_id, margin_min_percent);

alter table parts add column if not exists sale_coefficient_percent numeric(8,4) not null default 0.01 check (sale_coefficient_percent >= 0);
alter table parts add column if not exists photo_key text;
alter table suppliers add column if not exists siren varchar(9);
alter table suppliers add column if not exists siret varchar(14);
alter table suppliers add column if not exists legal_name varchar(240);
alter table suppliers add column if not exists address text;
alter table suppliers add column if not exists postal_code varchar(20);
alter table suppliers add column if not exists city varchar(160);
alter table suppliers add column if not exists registry_source varchar(120);
alter table suppliers add column if not exists registry_checked_at timestamptz;
create unique index if not exists idx_suppliers_org_siret on suppliers(organization_id,siret) where siret is not null;

alter table quote_items add column if not exists sale_coefficient_percent numeric(8,4) not null default 0.01 check (sale_coefficient_percent >= 0);
alter table quote_items add column if not exists unit_price numeric(12,2) not null default 0 check (unit_price >= 0);
alter table quote_items add column if not exists photo_key text;

alter table quotes add column if not exists margin_coefficient_percent numeric(8,4) not null default 0.01 check (margin_coefficient_percent >= 0);
alter table quotes add column if not exists invoice_address_source varchar(20) not null default 'client' check (invoice_address_source in ('client','intervention'));
alter table quotes add column if not exists billing_address_snapshot text;
alter table quotes add column if not exists payment_status varchar(20) not null default 'unpaid' check (payment_status in ('unpaid','partially_paid','paid'));
alter table quotes add column if not exists amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0);
alter table quotes add column if not exists due_at date;
alter table quotes add column if not exists reminder_count integer not null default 0 check (reminder_count >= 0);
alter table quotes add column if not exists last_reminder_at timestamptz;
alter table quotes add column if not exists late_penalty_mode varchar(20) not null default 'none' check (late_penalty_mode in ('none','fixed','percent'));
alter table quotes add column if not exists late_penalty_value numeric(12,2) not null default 0 check (late_penalty_value >= 0);
alter table quotes add column if not exists electronic_profile varchar(30) not null default 'factur-x';
alter table quotes add column if not exists electronic_identifier varchar(160);
alter table quotes add column if not exists electronic_status varchar(30) not null default 'prepared' check (electronic_status in ('prepared','ready','sent','accepted','rejected'));
alter table quotes add column if not exists structured_invoice jsonb;
create index if not exists idx_quotes_payment_status on quotes(organization_id,document_type,payment_status,created_at desc);
create index if not exists idx_quotes_reminders on quotes(organization_id,document_type,reminder_count,last_reminder_at);

alter table appointments add column if not exists location_address text;
create index if not exists idx_appointments_location on appointments(organization_id,client_id,starts_at);

create table if not exists invoice_payments(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  amount numeric(12,2) not null check(amount > 0),
  payment_method varchar(20) not null check(payment_method in ('transfer','card','cash','cheque','crypto','other')),
  paid_at timestamptz not null default now(),
  reference varchar(160),
  note text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoice_payments_quote on invoice_payments(organization_id,quote_id,paid_at desc);

create table if not exists invoice_reminders(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  reminder_number integer not null check(reminder_number between 1 and 4),
  penalty_amount numeric(12,2) not null default 0 check(penalty_amount >= 0),
  sent_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  unique(quote_id,reminder_number)
);
create index if not exists idx_invoice_reminders_quote on invoice_reminders(organization_id,quote_id,sent_at desc);

create table if not exists electronic_invoice_profiles(
  organization_id uuid primary key references organizations(id) on delete cascade,
  platform_name varchar(160),
  platform_identifier varchar(160),
  registration_status varchar(30) not null default 'not_registered',
  routing_identifier varchar(160),
  updated_at timestamptz not null default now()
);

-- Seed conservateur : la première activité reste exploitable et adopte la protection minimale.
update activities set margin_min_percent=greatest(coalesce(margin_min_percent,0.01),0.01);
update parts set sale_coefficient_percent=greatest(coalesce(sale_coefficient_percent,0.01),0.01);
update quotes set margin_coefficient_percent=greatest(coalesce(margin_coefficient_percent,0.01),0.01);

-- Une facture historique n'est pas artificiellement marquée payée.
update quotes set payment_status=coalesce(payment_status,'unpaid') where document_type='invoice';
