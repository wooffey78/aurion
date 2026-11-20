-- Échéanciers de paiement : montants libres ou répartition automatique avec dernier centime ajusté.
create table if not exists invoice_installments(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  installment_number integer not null check(installment_number>0),
  due_at date not null,
  amount_due numeric(12,2) not null check(amount_due>=0),
  amount_paid numeric(12,2) not null default 0 check(amount_paid>=0),
  status varchar(20) not null default 'pending' check(status in ('pending','partially_paid','paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(quote_id,installment_number)
);
create index if not exists idx_invoice_installments_quote on invoice_installments(organization_id,quote_id,installment_number);
