-- Aurion 15.1.2 : sécurisation des parcours fournisseur, paiement et documents protégés.
-- Idempotent : complète uniquement le schéma déjà prévu par les migrations 020/021.
alter table suppliers add column if not exists siren varchar(9);
alter table suppliers add column if not exists siret varchar(14);
alter table suppliers add column if not exists legal_name varchar(240);
alter table suppliers add column if not exists address text;
alter table suppliers add column if not exists postal_code varchar(20);
alter table suppliers add column if not exists city varchar(160);
alter table suppliers add column if not exists registry_source varchar(120);
alter table suppliers add column if not exists registry_checked_at timestamptz;
create unique index if not exists idx_suppliers_org_siret on suppliers(organization_id,siret) where siret is not null;

alter table quotes add column if not exists payment_status varchar(20) not null default 'unpaid';
alter table quotes add column if not exists amount_paid numeric(12,2) not null default 0;
create index if not exists idx_quotes_payment_status on quotes(organization_id,document_type,payment_status,created_at desc);

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
